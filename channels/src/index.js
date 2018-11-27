import "@babel/polyfill";
import "setimmediate";

const pull = require("pull-stream");
const Pushable = require("pull-pushable");
const {tap} = require("pull-tap");
const stringify = require("pull-stringify");
const configuration = {
  iceServers: [{urls: "stun:stun.l.google.com:19302"}]
};

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

const processEvents = async event => {
  console.log("processEvents");
  console.log(event);
  console.log(event.type);
  const events = {
    "getPeerList": ({peers}) => {
      for (let peer in peers) {
        updateChannelInfo(peer)
      }
    },
    "responseOfferSDP": async ({jsep}) => {
      let pc = new RTCPeerConnection(configuration);

      pc.onicecandidate = event => {
        console.log("[ICE]", event);
        if (event.candidate) {
          sendController.push({
            request: "sendTrickleCandidate",
            candidate: event.candidate
          });
        }
      };

      pc.oniceconnectionstatechange = function (e) {
        console.log("[ICE STATUS] ", pc.iceConnectionState);
      };
      // let the "negotiationneeded" event trigger offer generation
      pc.ontrack = async event => {
        console.log("[ON Strack]", event);
        console.log(event);
        //event.streams.forEach(track => pc.addTrack(track, stream));
        document.getElementById("studio").srcObject = event.streams[0];
      };

      try {
        await pc.setRemoteDescription(jsep);
        await pc.setLocalDescription(await pc.createAnswer());
        sendController.push({
          request: "sendCreateAnswer",
          jsep: pc.localDescription
        });
        console.log("localDescription", pc.localDescription);
      } catch (err) {
        console.error(err);
      }

      // get a local stream, show it in a self-view and add it to be sent
      //stream.getTracks().forEach(track => pc.addTrack(track, stream));
      //document.getElementById("studio").srcObject = stream;
    },
    "sendChannelList": ({peers})=> {

    }
  };
  if (events[event.type]) return events[event.type](event);
  else {
    return new Promise((resolve, reject) => {
      reject("No processEvent", event.type);
    });
  }
};

const initApp = async () => {
  let streamers = {};
  console.log("init app");
  const node = await createNode();
  node.on("peer:discovery", peerInfo => {
    const idStr = peerInfo.id.toB58String();

    console.log("Discovered: " + idStr);

    !streamers[idStr] &&
    node.dialProtocol(peerInfo, "/controller", (err, conn) => {
      if (err) {
        // console.error("Failed to dial:", err);
        return;
      }
      streamers[idStr] = true;
      updateChannelInfo({id: idStr});
      pull(
        sendController,
        stringify(),
        conn,
        pull.map(o => window.JSON.parse(o.toString())),
        pull.drain(async o => {
          console.log("Drained", o);
          try {
            await processEvents(o);
          } catch(e) {
            console.error("[event]", e);
          } finally {
            console.log("setRemoteDescription");
          }
        })
      );
      sendController.push({
        type: "requestPeerInfo",
        peerId: node.peerInfo.id.toB58String()
      })
    });
  });
  node.on("peer:connect", peerInfo => {
    console.log("connected", peerInfo.id.toB58String())
  });
  node.on("peer:disconnect", peerInfo => {
    const id = peerInfo.id.toB58String();
    console.log("disconnected", id)
    const element = document.getElementById(id);
    element && element.remove();
    delete streamers[id];
  });
  node.start(err => {
    if (err) throw err;
    console.log("node is ready", node.peerInfo.id.toB58String());
    console.log(node.peerInfo.multiaddrs.toArray().map(o => o.toString()));
  });
  node.on("peer", peerInfo => {
    console.log("peer-discovery", peerInfo.id.toB58String());
  })
};
//document.addEventListener("DOMContentLoaded", initApp);
initApp();
