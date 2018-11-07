const pull = require("pull-stream");
const Pushable = require("pull-pushable");
const { tap } = require("pull-tap");
let sendController = Pushable();
window.pull = pull;
const createNode = require("./create-node");
const updateChannelInfo = info => {
  console.log("info", info);
  /* check id */
  const infoDiv = document.getElementById(info.id);
  if (infoDiv) {
    infoDiv.textContent = JSON.stringify(info);
  } else {
    const dom = document.createElement("div");
    dom.textContent = JSON.stringify(info);
    dom.setAttribute("id", info.id);
    document.body.appendChild(dom);
  }
};

const processEvents = event => {
  const events = {};
  events[event.type] && events[event.type](event);
};

const initApp = () => {
  console.log("init app");
  createNode.then(node => {
    window.currentNode = node;
    node.on("peer:discovery", peerInfo => {
      const idStr = peerInfo.id.toB58String();
      console.log("Discovered: " + idStr);

      node.dialProtocol(peerInfo, "/controller", (err, conn) => {
        if (err) {
          // console.error("Failed to dial:", err);
          return;
        }
        updateChannelInfo({ id: idStr });
        pull(sendController, tap(console.log), pull.map(JSON.stringify), conn);
        pull(conn, tap(console.log), tap(o => processEvents(o)), pull.log());

        // sendController.push({
        //   type: "channelRegister",
        //   idStr: idStr
        // });
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
