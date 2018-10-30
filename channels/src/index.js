const pull = require('pull-stream');
window.pull = pull;
const createNode = require("./create-node");
const updateChannelInfo = info => {
  console.log("info", info);
  /* check id */
  const infoDiv = document.getElementById(info.id);
  if (infoDiv) {
    infoDiv.textContent = JSON.stringify(info);
  } else {
    const dom = document.createElement('div');
    dom.textContent = JSON.stringify(info);
    dom.setAttribute('id', info.id);
    document.body.appendChild(dom);
  }
};
const initApp = () => {
  console.log("init app");
  createNode
    .then(node => {
      window.currentNode = node;
      node.on("peer:discovery", peerInfo => {
        const idStr = peerInfo.id.toB58String();
        console.log("Discovered: " + idStr);
        node.dialProtocol(peerInfo, '/streamer', (err, conn) => {
          if (err) {
            // console.error("Failed to dial:", err);
            return;
          }
          pull(
            conn,
            pull.drain(o => {
              const obj = JSON.parse(o.toString());
              console.log('responsed', obj);
              updateChannelInfo({...obj, id: idStr});
              pull(
                pull.values(['gotcha', ': ', node.peerInfo.id.toB58String()]),
                conn
              )
            })
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
