const pull = require("pull-stream");
const stringify = require("pull-stringify");
const Pushable = require("pull-pushable");
const {tap} = require("pull-tap");

const setupNode = ({node, sendToChannel, sendJanusStream}) => {
  node.handle("/controller", (protocol, conn) => {
    pull(
      sendToChannel,
      stringify(),
      conn,
      pull.map(o => JSON.parse(o.toString())),
      tap(console.log),
      pull.drain(o => {
      })
    );
  });
  let peers = {};
  node.on("peer:discovery", peerInfo => {
    const idStr = peerInfo.id.toB58String();
    if (!peers[idStr]) {
      peers[idStr] = {
        isDiscovered: true
      };
    }
    !peers[idStr].isDialed &&
      node.dialProtocol(peerInfo, "/streamer", (err, conn) => {
        if (err) {
          // console.error("Failed to dial:", err);
          return;
        }
        peers[idStr].isDialed = true;
        console.log(`[streamer] ${idStr} is dialed`);
        let sendToStudio = Pushable();
        pull(
          sendToStudio,
          stringify(),
          conn,
          pull.map(o => JSON.parse(o.toString())),
          tap(o => console.log("[STREAMER]", o)),
          pull.drain( o=> {
            // sendJanusStream.push
          })
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

module.exports = setupNode;