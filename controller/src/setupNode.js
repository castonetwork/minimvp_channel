const pull = require("pull-stream");
const stringify = require("pull-stringify");
const Pushable = require("pull-pushable");
const {tap} = require("pull-tap");
const Websocket = require("ws");
const wsSource = require("pull-ws/source");
const wsSink = require("pull-ws");
const chance = require("chance").Chance();
const Notify = require("pull-notify");

const recvNotify = Notify();
const sendStream = Pushable();

/* janus websocket Interface */
const sendSocketStream = (obj, resultHandler) => new Promise((resolve, reject) => {
  const transaction = chance.guid();
  sendStream.push({...obj, transaction});
  pull(
    recvNotify.listen(),
    pull.filter(o => o.transaction === transaction && o.janus !== "ack"),
    pull.drain(obj => {
      resolve(resultHandler && resultHandler(obj) || obj);
    })
  );
  /* TODO: success, failure */
});

const createSession = async () => await sendSocketStream({
  janus: "create"
}, o => o && o.data && o.data.id);

const attach = async sessionId => await sendSocketStream({
  janus: "attach",
  session_id: sessionId,
  plugin: "janus.plugin.videoroom"
}, o => o && o.data && o.data.id);

const createRoom = async ({sessionId, handleId}) => await sendSocketStream({
  janus: "message",
  session_id: sessionId,
  handle_id: handleId,
  body: {
    request: "create",
    description: "remon",
    bitrate: 102400,
    publishers: 1,
    fir_freq: 1,
    is_private: false,
    audiocodec: "opus",
    videocodec: "H264",
    video: true,
    audio: true,
    notify_joining: true,
    playoutdelay_ext: false,
    videoorient_ext: false
  }
}, o => o && o.plugindata && o.plugindata.data && o.plugindata.data.room);

const joinRoom = async ({sessionId, handleId, roomId}) => await sendSocketStream({
  janus: "message",
  session_id: sessionId,
  handle_id: handleId,
  body: {
    request: "join",
    room: roomId,
    type: "publisher",
    video: true,
    audio: true
  }
}, o => {
  console.log("joinRoom response", JSON.stringify(o))
});

const configure = async ({sessionId, handleId, roomId}) => await sendSocketStream({
  janus: "message",
  session_id: this._sessionId,
  handle_id: handleId,
  body: {
    request: "configure",
    room: roomId,
    ptype: "publisher",
    video: true,
    audio: true
  }
}, o=> o.jsep);

const setupJanusWebSocket = async ({wsUrl, protocol = "janus-protocol"}) =>
  new Promise(async (resolve, reject)=> {
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
    const timerId = setInterval(() => {
      sendStream.push({
        janus: "keepalive",
        session_id: sessionId,
        handle_id: handleId,
        transaction: chance.guid()
      });
    }, 30000);
    const roomId = await createRoom({sessionId, handleId});
    console.log(`roomId: ${roomId}`);
    await joinRoom({sessionId, handleId, roomId});
    console.log("room Joined");
    resolve({
      sessionId, handleId, roomId
    });
  });

/* setup Node */
const setupNode = ({node, wsUrl}) => {
  node.handle("/controller", (protocol, conn) => {
    const sendToChannel = Pushable();
    pull(
      sendToChannel,
      stringify(),
      conn,
      pull.map(o => JSON.parse(o.toString())),
      tap(console.log),
      pull.drain(o => {
      })
    );
  });
  let peers = {};
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
      peers[idStr] = { ...peers[idStr], roomInfo };
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
            "sendCreateOffer": async ()=> {
              const jsep = await configure(roomInfo);
              sendToStudio.push({
                type: "answer", jsep
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
    console.log(node.peerInfo.multiaddrs.toArray().map(o => o.toString()));
  });
};

module.exports = setupNode;