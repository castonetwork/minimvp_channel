const pull = require('pull-stream');
const createNode = require("./create-node");
const initApp = () => {
  console.log("init app");
  createNode
    .then(node => {
      window.currentNode = node;
      node.on("peer:discovery", peerInfo => {
        const idStr = peerInfo.id.toB58String();
        console.log("Discovered: " + idStr);
        // node.dialProtocol(peerInfo, '/kitty', (err, conn) => {
        node.dialProtocol(peerInfo, '/streamer', (err, conn) => {
          if (err) {
            // console.error("Failed to dial:", err);
            return;
          }
          console.log("hooray!", idStr);
          pull(
            conn,
            pull.drain(o=>console.log('responsed', JSON.parse(o.toString())))
          )

        });
      });
      node.on("peer:connect", peerInfo => {
        console.log("connected peerInfo: ", peerInfo.id.toB58String());
        console.log(peerInfo);
      });
      node.start(err => {
        if (err) throw err;
        console.log("node is ready", node.peerInfo.id.toB58String());
        console.log(node.peerInfo.multiaddrs.toArray().map(o => o.toString()));
      });
    });
};
document.addEventListener("DOMContentLoaded", initApp);
