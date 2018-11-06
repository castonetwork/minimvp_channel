const pull = require("pull-stream");
const { tap } = require("pull-tap");
const createNode = require("./create-node");
const MediaServer = require("./MediaServer");
const mediaServerEndPoints = ["ws://13.209.96.83:8188"];

const initApp = async () => {
  console.log("init app");
  let msNode = new MediaServer(mediaServerEndPoints[0]);
  let node = await createNode();
  console.log("node created");
  console.log("node is ready", node.peerInfo.id.toB58String());

  let isDialed = false;
  node.on("peer:discovery", peerInfo => {
    const idStr = peerInfo.id.toB58String();
    // console.log("Discovered: " + idStr);
    !isDialed && node.dialProtocol(peerInfo, "/cast", (err, conn) => {
      if (err) {
        // console.error("Failed to dial:", err);
        return;
      }
      msNode.assignPeer(idStr, conn);
      pull(
        conn,
        pull.map(o => JSON.parse(o.toString())),
        tap(console.log),
        tap(msNode.processStreamerEvent),
        pull.log()
      );
      isDialed = true;
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
