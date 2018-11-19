const pull = require("pull-stream");
const stringify = require("pull-stringify");
const Pushable = require("pull-pushable");
const {tap} = require("pull-tap");

const setupNode = node => {
  node.handle("/controller", (protocol, conn) => {
    let sendToChannel = Pushable();
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
  node.on("peer:discovery", peerInfo => {
    const idStr = peerInfo.id.toB58String();
    // console.log("Discovered: " + idStr);
    node.dialProtocol(peerInfo, "/streamer", (err, conn) => {
      if (err) {
        // console.error("Failed to dial:", err);
        return;
      }
      let sendToStudio = Pushable();
      pull(
        sendToStudio,
        stringify(),
        conn,
        pull.map(o => JSON.parse(o.toString())),
        tap(o => console.log("[STREAMER]", o)),
        pull.drain( o=> {

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