const pull = require("pull-stream");
const { tap } = require("pull-tap");
const createNode = require("./create-node");
const Pushable = require("pull-pushable");
const wsSource = require('pull-ws/source');
const wsSink = require("pull-ws");
const Websocket = require("ws");
const sendStream = Pushable();

const mediaServerEndPoint = "ws://13.209.96.83:8188";
const socket = new Websocket(mediaServerEndPoint, "janus-protocol");

const randomString = function (len) {
  var charSet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var randomString = "";
  for (var i = 0; i < len; i++) {
    var randomPoz = Math.floor(Math.random() * charSet.length);
    randomString += charSet.substring(randomPoz, randomPoz + 1);
  }
  return randomString;
};

const challenge = {
  create: () => ({
    janus: "create",
    transaction: randomString(12)
  }),
  attach: obj => ({
    janus: "attach",
    opaque_id: "videoroomtest-oxiuc88HQWG7",
    plugin: "janus.plugin.videoroom",
    session_id: obj.data.id,
    transaction: randomString(12)
  }),
  message: obj => ({
    janus: "message",
    body: {
      request: "create",
      room: obj.roomId,
      videocodec: "H264",
      audiocode: "opus",
      notify_joining: true
    },
    opaque_id: "videoroomtest-oxiuc88HQWG7",
    plugin: "janus.plugin.videoroom",
    handle_id: obj.data.id,
    session_id: obj.session_id,
    transaction: randomString(12)
  })
};

const initMediaServer = ()=> {
// sendStream
  pull(
    sendStream,
    tap(o => console.log("sent:", o)),
    pull.map(JSON.stringify),
    wsSink(socket)
  );
// recvStream
  pull(
    wsSource(socket),
    pull.map(o => JSON.parse(o)),
    pull.drain(o => {
      console.log("recv:", o);
      if (o.janus === 'success') {
        if (!o.session_id) {
          sendStream.push(challenge.attach(o))
        } else if (!o.sender) {
          sendStream.push(challenge.message({...o, roomId: 1}))
        } else {
          console.log("mediaServer initiated!");
        }
      }
    })
  );
  sendStream.push(challenge.create());
};

const initApp = async () => {
  console.log("init app");
  initMediaServer();
  let node = await createNode();
  console.log("node created");
  console.log("node is ready", node.peerInfo.id.toB58String());

  node.on("peer:discovery", peerInfo => {
    const idStr = peerInfo.id.toB58String();
    console.log("Discovered: " + idStr);
    node.dialProtocol(peerInfo, "/cast", (err, conn) => {
      if (err) {
        // console.error("Failed to dial:", err);
        return;
      }
      pull(
        conn,
        pull.map(o => JSON.parse(o.toString())),
        tap(o => {
          if (o.request === "getAnswerOffer") {
            console.log("getAnswerOffer");
            console.log(o);
          }
        }),
        pull.drain(x => {})
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
initApp();
