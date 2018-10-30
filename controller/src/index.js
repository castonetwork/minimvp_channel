const pull = require("pull-stream");
const { tap } = require("pull-tap");
const createNode = require("./create-node");
const mediaServerEndPoint = "ws://13.209.96.83:8188";
const WebSocket = require("websocket").client;
const ws = new WebSocket();
const Janus = require("./lib/Janus");
let wsConn, msgObj;
let janusSession = {};
const janusParser = {
  success: msg => {
    console.log(msg);
    janusSession.sessionId = msg.data.id;
  }
};

ws.on("connect", conn => {
  wsConn = conn;
  console.log("Open!");
  console.log(
    JSON.stringify({ janus: "create", transaction: Janus.randomString(12) })
  );
  wsConn.on("message", msg => {
    console.log(msg);
    let msgObj = JSON.parse(msg);
    parser[msgObj.janus] && parser[msgObj.janus](msgObj);
  });

  wsConn.sendUTF(
    JSON.stringify({ janus: "create", transaction: Janus.randomString(12) })
  );
});
ws.connect(
  mediaServerEndPoint,
  "janus-protocol"
);

const processA = tap(o => {
  if (o.request === "sendCreateOffer") {
    console.log("sendCreateOffer");
    console.log(o);
    wsConn.sendUTF(
      JSON.stringify({
        type: "offer",
        sdp: o.offer
      })
    );
  }
});
const initApp = async () => {
  console.log("init app");
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
        processA,
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
