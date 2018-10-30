const pull = require("pull-stream");
const { tap } = require("pull-tap");
const createNode = require("./create-node");
const processA = tap(o => {
  if (o.request === "sendCreateOffer") {
    console.log("sendCreateOffer");
    console.log(o);
  }
})
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
        pull.drain( x => {})
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
