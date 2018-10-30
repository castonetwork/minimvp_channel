import "babel-polyfill";

const pull = require("pull-stream");

const createNode = require("./create-node");
let conn, offerSDP;
let $ = {};
const domReady = new Promise((resolve, reject) => {
  console.log("DOM ready");
  document.getElementById("btnReady").addEventListener("click", e => {
    pull(
      pull.values([
        JSON.stringify({
          request: "sendCreateOffer",
          offer: offerSDP
        }),
        JSON.stringify({
          request: "getAnswerOffer",
          offer: "xxx"
        })
      ]),
      conn
    );
  });
  resolve();
});
const numReqAudioTracks = 2;
const createOffer = async () => {
  const pc = new RTCPeerConnection(null);
  for(let i = 0 ; i < numReqAudioTracks ; i++){
    const acx = new AudioContext();
    const dst = acx.createMediaStreamDestination();

    const track = dst.stream.getTracks()[0];
    pc.addTrack(track, dst.stream);
  }
  const offerOpts = {
    offerToReceiveAudio : 1,
    offerToReceiveVideo : 1,
    iceRestart : 0,
    voiceActivityDetection : 0
  };
  try{
    const offer = await pc.createOffer(offerOpts);
    await pc.setLocalDescription(offer);
    return offer;
  }catch(e){
    console.error(e);
  }
};

const initApp = async() => {
  console.log("init app");

  offerSDP = await createOffer();
  

  domReady.then(createNode).then(node => {
    console.log("node created");
    console.log("node is ready", node.peerInfo.id.toB58String());
    node.handle("/cast", (protocol, _conn) => {
      conn = _conn;
      console.log("dialed!!");
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

      $.startEvent;
    });
  });
};
initApp();