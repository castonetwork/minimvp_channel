import "babel-polyfill";

const pull = require("pull-stream");
const Pushable = require("pull-pushable");
let sendStream = Pushable();
const createNode = require("./create-node");

/* peerConnection */
let pc = new RTCPeerConnection(null);
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
pc.oniceconnectionstatechange = () =>
  console.log("[ICE STATUS] ", pc.iceConnectionState);

// let the "negotiationneeded" event trigger offer generation
pc.onnegotiationneeded = () => {
};
const onBtnReadyClick = async e => {
  try {
    // get a local stream, show it in a self-view and add it to be sent
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: true
    });
    stream.getTracks().some(track => pc.addTrack(track, stream));
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
};

const domReady = () => {
  console.log("DOM ready");
  document.getElementById("btnReady").addEventListener("click", onBtnReadyClick);
};

const handleStreamer = (protocol, conn) => {
  document.getElementById("btnReady").classList.remove("connecting");
  document.getElementById("btnReady").classList.remove("button-outline");
  console.log("dialed!!", protocol);
  pull(sendStream,
    pull.map(o => JSON.stringify(o)),
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
};

const initApp = async () => {
  console.log("init app");
  await domReady();
  const node = await createNode();
  console.log("node created");
  console.log("node is ready", node.peerInfo.id.toB58String());

  node.handle("/streamer", handleStreamer);
  node.start(err => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(node.peerInfo.multiaddrs.toArray().map(o => o.toString()));
  });
};
initApp();
