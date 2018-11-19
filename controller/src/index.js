const pull = require("pull-stream");
const {tap} = require("pull-tap");
const createNode = require("./create-node");
const mediaServerEndPoints = [process.env.MSPORT || "ws://127.0.0.1:8188"];
const JanusServer = require("./Janus");
const setupNode = require("./setupNode");

const initNode = async () => {
  console.log(">> janusInstance instantiated");
  console.log(">> init controller Node");
  let node = await createNode();
  console.log("node created");
  console.log("node is ready", node.peerInfo.id.toB58String());
  setupNode(node);
};

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