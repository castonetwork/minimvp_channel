import "babel-polyfill";

const pull = require("pull-stream");
const Pushable = require("pull-pushable");
let sendStream = Pushable();

const createNode = require("./create-node");
let offerSDP;
let $ = {};
const domReady = new Promise((resolve, reject) => {
  console.log("DOM ready");
  document.getElementById("btnReady").addEventListener("click", e => {
    sendStream.push({
      request: "sendCreateOffer",
      jsep: offerSDP
    });
  });
  resolve();
});
const numReqAudioTracks = 2;
const createOffer = async () => {
  const pc = new RTCPeerConnection(null);
  for (let i = 0; i < numReqAudioTracks; i++) {
    const acx = new AudioContext();
    const dst = acx.createMediaStreamDestination();

    const track = dst.stream.getTracks()[0];
    pc.addTrack(track, dst.stream);
  }
  const offerOpts = {
    offerToReceiveAudio: 1,
    offerToReceiveVideo: 1,
    iceRestart: 0,
    voiceActivityDetection: 0
  };
  try {
    const offer = await pc.createOffer(offerOpts);
    await pc.setLocalDescription(offer);
    return offer;
  } catch (e) {
    console.error(e);
  }
};

const initApp = async () => {
  console.log("init app");

  offerSDP = await createOffer();

  domReady.then(createNode).then(node => {
    console.log("node created");
    console.log("node is ready", node.peerInfo.id.toB58String());
    node.handle("/cast", (protocol, conn) => {
      console.log("dialed!!");
      // send request to controller
      pull(sendStream, pull.map(o=>console.log(o) || JSON.stringify(o)), conn);

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
