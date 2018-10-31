const pull = require("pull-stream");
const { tap } = require("pull-tap");
const createNode = require("./create-node");
const initMediaServer = require('./initMediaServer');
const Pushable = require("pull-pushable");
const Websocket = require("ws");
const sendStream = Pushable();
const mediaServerEndPoint = "ws://13.209.96.83:8188";
const socket = new Websocket(mediaServerEndPoint, "janus-protocol");

const initApp = async () => {
  console.log("init app");
  initMediaServer({
    sendStream,
    socket
  });
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
