import "babel-polyfill";
import "setimmediate";

const pull = require("pull-stream");
const Pushable = require("pull-pushable");
const { tap } = require("pull-tap");
const stringify = require("pull-stringify");

let sendController = Pushable();
window.pull = pull;
const createNode = require("./create-node");
const updateChannelInfo = info => {
  console.log("info", info);
  /* check id */
  const infoDiv = document.getElementById(info.id);
  if (infoDiv) {
    infoDiv.textContent = window.JSON.stringify(info);
  } else {
    const dom = document.createElement("div");
    dom.textContent = window.JSON.stringify(info);
    dom.setAttribute("id", info.id);
    document.body.appendChild(dom);
    dom.addEventListener("click", e => {
      console.log("send request OFFER");
      sendController.push({
        request: "requestOfferSDP"
      });
    });
  }
};

const processEvents = event => {
  console.log("processEvents")
  console.log(event)
  console.log(event.type)
  const events = {
    responseOfferSDP : async ({ jsep }) => {
      console.log()
      let pc = new RTCPeerConnection(null);

      pc.onicecandidate = event => {
        console.log("[ICE]", event);
        // if (event.candidate) {
        //   sendController.push({
        //     request: "sendTrickleCandidate",
        //     candidate: event.candidate
        //   });
        // }
      };

      pc.oniceconnectionstatechange = function(e) {
        console.log("[ICE STATUS] ", pc.iceConnectionState);
      };
      // let the "negotiationneeded" event trigger offer generation
      pc.ontrack = async event => {
        console.log("[ON Strack]", event);
        console.log(event)
        document.getElementById("studio").srcObject = event.streams[0];
      };

      try {
        await pc.setRemoteDescription(jsep);
        console.log("localDescription", pc.localDescription);
      } catch (err) {
        console.error(err);
      }

      // get a local stream, show it in a self-view and add it to be sent
      //stream.getTracks().forEach(track => pc.addTrack(track, stream));
      //document.getElementById("studio").srcObject = stream;
    }
  };
  if(events[event.type])
    return events[event.type](event);
  else{
    return new Promise((resolve, reject)=>{
      reject("No processEvent");
    });
  }
};

const initApp = () => {
  let boradCasters = {

  }
  console.log("init app");
  createNode.then(node => {
    window.currentNode = node;
    node.on("peer:discovery", peerInfo => {
      const idStr = peerInfo.id.toB58String();
      
      console.log("Discovered: " + idStr);

      !boradCasters[idStr] && node.dialProtocol(peerInfo, "/controller", (err, conn) => {
        if (err) {
          // console.error("Failed to dial:", err);
          return;
        }
        boradCasters[idStr] = true;
        updateChannelInfo({ id: idStr });
        pull(sendController, stringify(), conn);
        pull(
          conn,
          pull.map(o => window.JSON.parse(o.toString())),
          pull.drain(o => {
            console.log("Drained", o);
            processEvents(o).then(x => {
              console.log("setRemoteDescription!");
            }).catch(console.error);
          })
        );
      });
    });
    node.start(err => {
      if (err) throw err;
      console.log("node is ready", node.peerInfo.id.toB58String());
      console.log(node.peerInfo.multiaddrs.toArray().map(o => o.toString()));
    });
  });
};
//document.addEventListener("DOMContentLoaded", initApp);
initApp();
