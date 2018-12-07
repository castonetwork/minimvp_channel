import "@babel/polyfill";

const pull = require("pull-stream");
const combineLatest = require("pull-combine-latest");
const Pushable = require("pull-pushable");
const Notify = require("pull-notify");
const createNode = require("./create-node");

/* UI Stream */
const btnReadyClickStream = Pushable();

/* Network Stream */
const sendStream = Pushable();
const networkReadyNotify = Notify();

/* watch network Ready Status */
pull(
  networkReadyNotify.listen(),
  pull.filter(o => o),
  pull.drain(() => {
    document.getElementById("btnReady").classList.remove("connecting");
    document.getElementById("btnReady").classList.remove("button-outline");
  })
);
pull(
  networkReadyNotify.listen(),
  pull.filter(o => !o),
  pull.drain(() => {
    document.getElementById("btnReady").classList.add("connecting");
    document.getElementById("btnReady").classList.add("button-outline");
  })
);
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

const onBtnReadyClick = e => console.log("ready clicked") || btnReadyClickStream.push(e);

const sendCreateOfferStream = async () =>
  pull(
    combineLatest([btnReadyClickStream, networkReadyNotify.listen()]),
    pull.drain(async o => {
      console.log("combineLatest", o);
      if (o[1]) {
        try {
          // get a local stream, show it in a self-view and add it to be sent
          const stream = await navigator.mediaDevices.getUserMedia({
            audio: true,
            video: true
          });
          stream.getTracks().forEach(track => pc.addTrack(track, stream));
          document.getElementById("studio_video").srcObject = stream;
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
      }
    })
  );

const domReady = () => {
  console.log("DOM ready");
  document.getElementById("btnReady").addEventListener("click", onBtnReadyClick);
};

const handleStreamer = (protocol, conn) => {
  console.log("dialed!!", protocol, conn);
  pull(sendStream,
    pull.map(o => JSON.stringify(o)),
    conn,
    pull.map(o => window.JSON.parse(o.toString())),
    pull.drain(o => {
      const controllerResponse = {
        answer: async desc => {
          console.log("controller answered", desc);
          await pc.setRemoteDescription(desc);
        },
        requestStreamerInfo: ({peerId}) => {
          sendStream.push({
            request: "updateStreamerInfo",
            idStr: peerId,
            profile: JSON.parse(localStorage.getItem("profile"))
          });
        }
      };
      controllerResponse[o.type] && controllerResponse[o.type](o);
    })
  );
  /* build a createOfferStream */
  sendCreateOfferStream();
  networkReadyNotify(true);
};

let profile = {};
const getProfile = () => JSON.parse(localStorage.getItem("profile"));
const gotoStudio = () => {
  document.body.setAttribute("data-scene", "studio");
  document.getElementById("streamerId").textContent = profile.nickName;
};

const initSetup = () => {
  if (!localStorage.getItem("profile")) {
    const avatarElements = document.getElementsByClassName("avatar");
    const randomAvatarId = `${~~(Math.random() * 52)}`.padStart(2, "0");
    console.log(randomAvatarId);
    const setAvatarId = id =>
      Array.from(avatarElements).forEach(o => o.setAttribute("data-id", id));
    setAvatarId(randomAvatarId);
    document.querySelectorAll(".card>.thumbnails>dd")
      .forEach(o => o.addEventListener("click", e => {
        setAvatarId(e.currentTarget.getAttribute("data-id"));
      }));
    document.getElementById("userInfoForm").addEventListener("submit", async e => {
      const nickName = document.getElementById("nickName").value;
      if (document.getElementById("nickName").value) {
        const {body} = await fetch(
          getComputedStyle(document.getElementsByClassName('avatar')[0])
            .backgroundImage.replace(/url\("(.*)"\)/g, "$1")
        );
        const response = await new Response(body);
        const blob = await response.blob();
        const dataURI = await new Promise((resolve, reject)=>{
          const r = new FileReader();
          r.onload = e => resolve(e.target.result);
          r.readAsDataURL(blob);
        });
        localStorage.setItem("profile", JSON.stringify({
          "avatar": {
            "image": dataURI
          },
          nickName
        }));
        profile = getProfile();
        gotoStudio();
      }
      e.preventDefault();
    });
    return false;
  } else {
    profile = getProfile();
    gotoStudio();
    return true;
  }
};

const initApp = async () => {
  console.log("init app");
  initSetup() && await domReady();
  const node = await createNode();
  console.log("node created");
  console.log("node is ready", node.peerInfo.id.toB58String());

  node.handle("/streamer", handleStreamer);
  node.on("peer:connect", peerInfo => {
    console.log("peer connected:", peerInfo.id.toB58String());
  });
  node.on("peer:disconnect", peerInfo => {
    console.log("peer disconnected:", peerInfo.id.toB58String());
    networkReadyNotify(false);
  });
  node.start(err => {
    if (err) {
      console.error(err);
      return;
    }
    console.log(node.peerInfo.multiaddrs.toArray().map(o => o.toString()));
  });
};

initApp();
