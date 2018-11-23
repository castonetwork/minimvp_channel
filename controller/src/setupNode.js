const pull = require("pull-stream");
const stringify = require("pull-stringify");
const Pushable = require("pull-pushable");
const {tap} = require("pull-tap");
const Websocket = require("ws");
const wsSource = require("pull-ws/source");
const wsSink = require("pull-ws");
const {sendStream, recvNotify} = require("./pushnNotify");
const {keepAlive, createSession, attach, createRoom, joinRoom, configure, addIceCandidate} = require("./socketStream");

const socketSingleTon = (()=> {
  let socket;
  return {
    getSocket: (wsUrl, protocol)=> {
      if (!socket) {
        socket = new Websocket(wsUrl, protocol);
      }
      return socket;
    }
  }
})();

const setupJanusWebSocket = async ({wsUrl, protocol = "janus-protocol"}) =>
  new Promise(async (resolve, reject) => {
    const socket = socketSingleTon.getSocket(wsUrl, protocol);
    pull(
      sendStream,
      pull.map(JSON.stringify),
      tap(o => console.log("[SENT]", o)),
      wsSink(socket)
    );
    pull(
      wsSource(socket),
      pull.map(o => JSON.parse(o)),
      pull.drain(o => {
        recvNotify(o);
      })
    );

    /* mediaServer initialize Sequence */
    const sessionId = await createSession();
    const handleId = await attach(sessionId);
    /* generate keepalive */
    const timerHandler = setInterval(() => keepAlive({sessionId, handleId}), 30000);
    const roomId = await createRoom({sessionId, handleId});
    console.log(`[CONTROLLER] roomId: ${roomId}`);
    socket.on('close', ()=> clearInterval(timerHandler));
    resolve({
      sessionId, handleId, roomId
    });
  });

/* setup Node */
const setupNode = ({node, wsUrl}) => {
  let peers = {};
  node.handle("/controller", (protocol, conn) => {
    const sendToChannel = Pushable();
    pull(
      sendToChannel,
      stringify(),
      conn,
      pull.map(o => JSON.parse(o.toString())),
      tap(console.log),
      pull.drain(event => {
        const events = {
          "requestPeerInfo": o => {
            sendToChannel.push({
              type: "sendChannelList",
              peers
            });
          }
        };
        events[event.type] && events[event.type](event);
      })
    );
  });
  node.on("peer:discovery", peerInfo => {
    const idStr = peerInfo.id.toB58String();
    if (!peers[idStr]) {
      peers[idStr] = {
        isDiscovered: true
      };
    }
    !peers[idStr].isDialed &&
    node.dialProtocol(peerInfo, "/streamer", async (err, conn) => {
      if (err) {
        // console.error("Failed to dial:", err);
        return;
      }
      peers[idStr].isDialed = true;
      console.log(`[STREAMER] ${idStr} is dialed`);
      let pushStreamer = Pushable();
      // setup a janus WebSocket interface
      const roomInfo = await setupJanusWebSocket({wsUrl});
      peers[idStr] = {...peers[idStr], roomInfo};
      pull(
        pushStreamer,
        stringify(),
        conn,
        pull.map(o => JSON.parse(o.toString())),
        tap(o => console.log("[STREAMER]", o)),
        pull.map(o => ({...o, ...roomInfo})),
        pull.drain(event => {
          const events = {
            "sendCreateOffer": async ({jsep}) => {
              console.log("[CONTROLLER] joining room");
              const joinedRoomInfo = await joinRoom(roomInfo);
              peers[idStr].roomInfo.publisherId = joinedRoomInfo.plugindata.data.id;
              console.log("[CONTROLLER] room Joined");
              const answerSDP = await configure({...roomInfo, jsep});
              console.log("[MEDIASERVER] configured:", answerSDP);
              pushStreamer.push({
                type: "answer",
                jsep: answerSDP.jsep
              })
            },
            "sendTrickleCandidate": async ({candidate}) => {
              console.log("[CONTROLLER] addIceCandidate");
              await addIceCandidate({
                candidate,
                ...roomInfo
              })
            }
          };
          events[event.request] && events[event.request](event);
          // sendJanusStream.push
        })
      );
    });
  });

  node.start(err => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(">> ", node.peerInfo.multiaddrs.toArray().map(o => o.toString()));
  });
};

module.exports = setupNode;