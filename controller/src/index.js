const pull = require("pull-stream");
const Pushable = require("pull-pushable");

const createNode = require("./create-node");
const mediaServerEndPoints = [process.env.MSPORT || "ws://127.0.0.1:8188"];
const JanusServer = require("./Janus");
const setupNode = require("./setupNode");
const setupJanusWebSocket = require("./setupJanusWebSocket");

// initialize a controller node
const initNode = async () => {
  console.log(">> janusInstance instantiated");
  console.log(">> init controller Node");
  let node = await createNode();
  console.log("node created");
  console.log("node is ready", node.peerInfo.id.toB58String());

  const sendToStreamer = Pushable();
  const sendJanusStream = Pushable();
  // setup a libp2p node
  setupNode({node, sendToStreamer, sendJanusStream});
  // setup a janus WebSocket interface
  setupJanusWebSocket({
    wsUrl: mediaServerEndPoints[0],
    sendToStreamer,
    sendJanusStream
  });
};

// initialize app
const initApp = async () => {
  console.log(">> init mediaServer", mediaServerEndPoints);
  const janusInstance = new JanusServer();
  pull(
    janusInstance.handler,
    pull.drain(o => {
      const events = {
        ready: initNode,
        error: ({description}) => {
          console.error(description)
        },
        terminated: () => {
          console.error("terminated")
        }
      };
      events[o.type] && events[o.type](o);
    })
  );
};

initApp();