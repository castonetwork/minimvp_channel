const pull = require("pull-stream");
const {tap} = require("pull-tap");
const createNode = require("./create-node");
const MediaServer = require("./MediaServer");
const mediaServerEndPoints = ["ws://13.209.96.83:8188"];
const Pushable = require('pull-pushable');
const stringify = require('pull-stringify');
let sendChannel = Pushable();

const initApp = async () => {
  console.log("init app");
  let node = await createNode();
  console.log("node created");
  console.log("node is ready", node.peerInfo.id.toB58String());

  let isDialed = false;
  node.handle("/controller", (protocol, conn) => {
    pull(
      sendChannel,
      stringify(),
      conn
    );
    sendChannel.push({
      type: "answer",
      desc: "controller handled"
    });
    pull(
      conn,
      pull.map(o => console.log("drain", o) || o.toString()),
      pull.drain(o =>
        console.log(o)
      )
    )
  });
  node.on("peer:discovery", peerInfo => {
    const idStr = peerInfo.id.toB58String();
    // console.log("Discovered: " + idStr);
    !isDialed && node.dialProtocol(peerInfo, "/streamer", (err, conn) => {
      if (err) {
        // console.error("Failed to dial:", err);
        return;
      }
      const msNode = new MediaServer(mediaServerEndPoints[0]);
      pull(
        conn,
        pull.map(o => JSON.parse(o.toString())),
        tap(console.log),
        tap(o => msNode.processStreamerEvent(o, conn)),
        pull.log()
      );
      isDialed = true;
      console.log("stop dial");
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
initApp();
