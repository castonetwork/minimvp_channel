const pull = require("pull-stream");
const createNode = require("./create-node");
const initApp = () => {
  console.log("init app");

  createNode().then(node => {
    console.log("node created");
    console.log("node is ready", node.peerInfo.id.toB58String());
    console.log(node.peerInfo.multiaddrs.toArray().map(o=>o.toString()));
    node.handle('/kitty',(protocol, conn) => {
      console.log("dialed!!");
    });
  });
};
initApp();
