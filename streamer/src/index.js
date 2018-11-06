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
    pc = new RTCPeerConnection({});

    // send any ice candidates to the other peer
    pc.onicecandidate = event => {
      //sendStream.push(JSON.stringify({candidate: event.candidate}))
    };

    // let the "negotiationneeded" event trigger offer generation
    pc.onnegotiationneeded = async () => {
      try {
        await pc.setLocalDescription(await pc.createOffer());
        // send the offer to the other peer
        //sendStream.push(JSON.stringify({desc: pc.localDescription}));
        sendStream.push({
          request: "sendCreateOffer",
          jsep: pc.localDescription
        });
      } catch (err) {
        console.error(err);
      }
    };

    try {
      // get a local stream, show it in a self-view and add it to be sent
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: true
      });
      stream.getTracks().forEach(track => pc.addTrack(track, stream));
      document.getElementById("studio").srcObject = stream;
    } catch (err) {
      console.erro(err);
    }
  });
  resolve();
});

const initApp = async () => {
  console.log("init app");
  domReady.then(createNode).then(node => {
    console.log("node created");
    console.log("node is ready", node.peerInfo.id.toB58String());
    node.handle("/cast", (protocol, conn) => {
      console.log("dialed!!");
      pull(sendStream, pull.map(o => JSON.stringify(o)), conn);
      pull(
        conn,
        pull.map(o => window.JSON.stringify(o.toString())),
        pull.drain(o => {
          console.log("GET ANSWER? ", o);
          //await pc.setRemoteDescription(desc);
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
