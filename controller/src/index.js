const pull = require("pull-stream");
const { tap } = require("pull-tap");
const Pushable = require("pull-pushable");
const createNode = require("./create-node");
const mediaServerEndPoints = [ process.env.MSPORT || "ws://127.0.0.1:8188"];
const stringify = require("pull-stringify");
const JanusServer = require("./Janus");

const initApp = async () => {
  console.log(">> init mediaServer", mediaServerEndPoints);
  const janusInstance = new JanusServer();
  pull(
    janusInstance.handler,
    pull.drain(async o=> {
      console.log(o);
      console.log(">> janusInstance instantiated");
      console.log(">> init controller Node");
      let node = await createNode();
      console.log("node created");
      console.log("node is ready", node.peerInfo.id.toB58String());

      node.handle("/controller", (protocol, conn) => {
        let sendToChannel = Pushable();
        pull(sendToChannel, stringify(), conn);
        pull(
          conn,
          pull.map(o => JSON.parse(o.toString())),
          tap(console.log),
          pull.drain(o => {})
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
            tap(console.log),
            pull.log()
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
    })
  );
};
initApp();
