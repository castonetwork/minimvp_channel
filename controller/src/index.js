const pull = require("pull-stream");
const { tap } = require("pull-tap");
const Pushable = require("pull-pushable");
const createNode = require("./create-node");
const MediaServer = require("./MediaServer");
const mediaServerEndPoints = [ process.env.MSPORT || "ws://127.0.0.1:8188"];
const stringify = require("pull-stringify");
const probe = require("pull-probe");
const initApp = async () => {
  console.log("init app", mediaServerEndPoints);
  let node = await createNode();
  console.log("node created");
  console.log("node is ready", node.peerInfo.id.toB58String());

  let isDialed = false;
  node.handle("/controller", (protocol, conn) => {
    let sendToChannel = Pushable();
    const msViewerNode = new MediaServer(mediaServerEndPoints[0], {
      type: "subscriber"
    });
    pull(sendToChannel, stringify(), conn);
    pull(
      conn,
      pull.map(o => JSON.parse(o.toString())),
      tap(console.log),
      pull.drain(o => msViewerNode.processStreamerEvent(o, sendToChannel))
    );
  });
  node.on("peer:discovery", peerInfo => {
    const idStr = peerInfo.id.toB58String();
    // console.log("Discovered: " + idStr);
    !isDialed &&
      node.dialProtocol(peerInfo, "/streamer", (err, conn) => {
        if (err) {
          // console.error("Failed to dial:", err);
          return;
        }
        let sendToStudio = Pushable();
        const msNode = new MediaServer(mediaServerEndPoints[0]);
        pull(sendToStudio, stringify(), conn);
        pull(
          conn,
          pull.map(o => JSON.parse(o.toString())),
          tap(console.log),
          tap(o => msNode.processStreamerEvent(o, sendToStudio)),
          pull.log()
        );

        isDialed = true;
        console.log("stop dial");
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
