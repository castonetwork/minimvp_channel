const pull = require("pull-stream");
const wsSource = require("pull-ws/source");
const wsSink = require("pull-ws");
const Websocket = require("ws");
const Notify = require("pull-notify");
const {tap} = require("pull-tap");
const recvNotify = Notify();
const chance = require("chance").Chance();

let sendStream, sendStreamer;

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
}, o => console.log("joinRoom response", JSON.stringify(o)));

const setupJanusWebSocket = async ({wsUrl, protocol = "janus-protocol", sendJanusStream, sendToStreamer}) => {
  sendStreamer = sendToStreamer;
  sendStream = sendJanusStream;
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
};

module.exports = setupJanusWebSocket;