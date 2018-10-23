const createNode = require("./create-node");
const initApp = () => {
  console.log("init app");

  createNode
    .then(node => {
      console.log("node created");
      console.log("node is ready", node.peerInfo.id.toB58String());
      // node.on("peer:discovery", peerInfo => {
      //   const idStr = peerInfo.id.toB58String();
      //   console.log("Discovered: " + idStr);
      //
      //   node.dialProtocol(peerInfo, '/kitty', (err, conn) => {
      //     if (err) {
      //       //return console.log("Failed to dial:", idStr);
      //       return;
      //     }
      //     console.log("hooray!", idStr);
      //   });
      // });
      // node.handle('/kitty',(protocol, conn) => {
      //   console.log("dialed!!");
      // });
      node.on("peer:connect", peerInfo => {
        console.log('connected', peerInfo.id.toB58String())
      });
      node.start(err => {
        if (err) {
          console.error(err);
          return;
        }
        console.log(node.peerInfo.multiaddrs.toArray().map(o => o.toString()));
      })
    });
};
initApp();
