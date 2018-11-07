import "babel-polyfill";

const pull = require("pull-stream");
const Pushable = require("pull-pushable");
let sendStream = Pushable();
let pc;
const createNode = require("./create-node");

let $ = {};
const domReady = new Promise((resolve, reject) => {
  console.log("DOM ready");
  document.getElementById("btnReady").addEventListener("click", async e => {
    pc = new RTCPeerConnection(null);

    // send any ice candidates to the other peer
    pc.onicecandidate = event => {
      console.log("[ICE]", event);
      if (event.candidate) {
        sendStream.push({
          request: "sendTrickleCandidate",
          candidate: event.candidate
        });
      }
    };
    pc.oniceconnectionstatechange = function(e) {
      console.log("[ICE STATUS] ", pc.iceConnectionState);
    };

    // let the "negotiationneeded" event trigger offer generation
    pc.onnegotiationneeded = async () => {};

    try {
      // get a local stream, show it in a self-view and add it to be sent
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      document.getElementById("studio").srcObject = stream;
      try {
        await pc.setLocalDescription(await pc.createOffer());
        console.log("localDescription", pc.localDescription);
        sendStream.push({
          request: "sendCreateOffer",
          jsep: pc.localDescription
        });
      } catch (err) {
        console.error(err);
      }
    } catch (err) {
      console.error(err);
    }
  });
  resolve();
});

const initApp = async () => {
  console.log("init app");
  domReady.then(createNode).then(node => {
    console.log("node created");
    console.log("node is ready", node.peerInfo.id.toB58String());

    node.handle("/streamer", (protocol, conn) => {
      document.getElementById("btnReady").classList.remove("connecting");
      document.getElementById("btnReady").classList.remove("button-outline");
      console.log("dialed!!");
      pull(sendStream, pull.map(o => JSON.stringify(o)), conn);
      pull(
        conn,
        pull.map(o => window.JSON.parse(o.toString())),
        pull.drain(o => {
          const controllerResponse = {
            answer: async desc => {
              console.log("controller answered", desc);
              await pc.setRemoteDescription(desc);
            }
          };
          controllerResponse[o.type] && controllerResponse[o.type](o);
        })
      );
    });
    node.on("peer:connect", peerInfo => {
      console.log("connected", peerInfo.id.toB58String());
    });
    node.start(err => {
      if (err) {
        console.error(err);
        return;
      }
      console.log(node.peerInfo.multiaddrs.toArray().map(o => o.toString()));
    });
  });
};
initApp();
