import * as most from 'most';
const pull = require("pull-stream");
const createNode = require("./create-node");
let $ = {};
const domReady = new Promise((resolve, reject) => {
  console.log('DOM ready');
  $.startEvent = most.fromEvent('click', document.getElementById('btnReady'));
  resolve();
});
const initApp = () => {
  console.log("init app");
  domReady
    .then(createNode)
    .then(node => {
      console.log("node created");
      console.log("node is ready", node.peerInfo.id.toB58String());
      node.handle('/cast',(protocol, conn) => {
        console.log("dialed!!");
      });
      node.on("peer:connect", peerInfo => {
        console.log('connected', peerInfo.id.toB58String())
      });
      node.start(err => {
        if (err) {
          console.error(err);
          return;
        }
        console.log(node.peerInfo.multiaddrs.toArray().map(o => o.toString()));

        $.startEvent
      })
    });
};
initApp();
