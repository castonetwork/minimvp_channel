const pull = require("pull-stream");
const stringify = require("pull-stringify");
const Pushable = require("pull-pushable");
const {tap} = require("pull-tap");
const Websocket = require("ws");
const wsSource = require("pull-ws/source");
const wsSink = require("pull-ws");
const {sendStream, recvNotify} = require("./pushnNotify");
const {keepAlive, createSession, attach, createRoom, joinRoom, configure, addIceCandidate} = require("./socketStream");

const setupJanusWebSocket = async ({wsUrl, protocol = "janus-protocol"}) =>
  new Promise(async (resolve, reject) => {
    const socket = new Websocket(wsUrl, protocol);
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
    const timerId = setInterval(() => keepAlive({sessionId, handleId}), 30000);
    const roomId = await createRoom({sessionId, handleId});
    console.log(`[CONTROLLER] roomId: ${roomId}`);
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
            sendToChannel({
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
      let sendToStudio = Pushable();
      // setup a janus WebSocket interface
      const roomInfo = await setupJanusWebSocket({wsUrl});
      peers[idStr] = {...peers[idStr], roomInfo};
      console.log(`[STREAMER] peerInfo:${JSON.stringify(peers[idStr])}`);
      pull(
        sendToStudio,
        stringify(),
        conn,
        pull.map(o => JSON.parse(o.toString())),
        tap(o => console.log("[STREAMER]", o)),
        pull.map(o => ({...o, ...peers[idStr]})),
        pull.drain(event => {
          const events = {
            "sendCreateOffer": async ({jsep}) => {
              console.log("[CONTROLLER] joining room");
              const joinedRoomInfo = await joinRoom(roomInfo);
              peers[idStr].roomInfo.publisherId = joinedRoomInfo.plugindata.data.id;
              console.log("[CONTROLLER] room Joined");
              const answerSDP = await configure({...roomInfo, jsep});
              console.log("[MEDIASERVER] configured:", answerSDP);
              sendToStudio.push({
                type: "answer",
                ...jsep
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