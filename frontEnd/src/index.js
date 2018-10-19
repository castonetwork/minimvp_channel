const createNode = require("./create-node");
const initApp = () => {
  console.log("init app");

  createNode((err, node) => {
    node.on("peer:discovery", peerInfo => {
      const idStr = peerInfo.id.toB58String();
      console.log("Discovered: " + idStr);

      node.dialProtocol(peerInfo, '/kitty', (err, conn) => {
        if (err) {
          return console.log("Failed to dial:", idStr);
        }
        console.log("hooray!", idStr);
      });
    });
    node.on("peer:connect", peerInfo => {
      console.log("connected peerInfo: ", peerInfo.id.toB58String());
    })
    node.start(err => {
      if (err) throw err;
      console.log("node is ready", node.peerInfo.id.toB58String());
    });
  });
};
document.addEventListener("DOMContentLoaded", initApp);
