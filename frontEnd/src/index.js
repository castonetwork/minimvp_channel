const createNode = require("./create-node");
const initApp = () => {
  console.log("init app");

  createNode((err, node) => {
    node.on("peer:discovery", peerInfo => {
      console.log("Discovered a peer");
      const idStr = peerInfo.id.toB58String();
      console.log("Discovered: " + idStr);

      node.dial(peerInfo, (err, conn) => {
        if (err) {
          return console.log("Failed to dial:", idStr);
        }
      });
    });
    node.start(err => {
      if (err) throw err;
      console.log("node is ready", node.peerInfo.id.toB58String());
    });
  });
};
document.addEventListener("DOMContentLoaded", initApp);
