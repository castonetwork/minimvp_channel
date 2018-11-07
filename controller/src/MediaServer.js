const pull = require("pull-stream");
const wsSource = require("pull-ws/source");
const wsSink = require("pull-ws");
const PeerHandler = require("./PeerHandler");
const { tap } = require("pull-tap");
const Websocket = require("ws");
const pullPromise = require("pull-promise");
const Pushable = require("pull-pushable");
const stringify = require("pull-stringify");

class MediaServer {
  constructor(_wsUrl, _config, _protocol = "janus-protocol") {
    console.log(this);
    if (!_wsUrl) throw new Error("NO webSocket url.");
    this.wsUrl = _wsUrl;
    this.protocal = _protocol;
    this.msPeerHandler;
    this.peers = {};
    this.sessionId;
    this.sendStream = Pushable();
    this.errorStream = Pushable();

    this.errorStreamInit = this.errorStreamInit.bind(this);
    this.sendStreamInit = this.sendStreamInit.bind(this);
    this.processReceiveInit = this.processReceiveInit.bind(this);
    this.processStreamerEvent = this.processStreamerEvent.bind(this);

    this.socket = new Websocket(this.wsUrl, this.protocal);
    this.errorStreamInit();
    this.socket.on("error", this.errorStream.push);
    this.socket.on("open", () => {
      this.msPeerHandler = new PeerHandler(
        this.sendStream,
        this.errorStream,
        _config ? _config.type : undefined
      );
      this.sendStreamInit();
      this.processReceiveInit();
      this.msPeerHandler.init();
    });
  }
  errorStreamInit() {
    pull(
      this.errorStream,
      pull.map(JSON.stringify),
      pull.drain(o => console.error("[ERROR] ", o))
    );
  }

  sendStreamInit() {
    // sendStream
    pull(
      this.sendStream,
      pull.map(JSON.stringify),
      tap(o => console.log("[SENT]", o)),
      wsSink(this.socket)
    );
  }

  processReceiveInit() {
    //recvStream
    pull(
      wsSource(this.socket),
      pull.map(o => JSON.parse(o)),
      tap(o => console.log("[RECV] ", o)),
      pull.drain(this.msPeerHandler.receive)
    );
  }

  processStreamerEvent(event, conn) {
    const events = {
      sendCreateOffer: ({ jsep }) => {
        pull(
          pullPromise.source(
            this.msPeerHandler._configure(jsep.type, jsep.sdp)
          ),
          pull.map(JSON.stringify),
          tap(console.log),
          conn
        );
      },
      sendTrickleCandidate: ({ candidate }) => {
        pull(
          pullPromise.source(this.msPeerHandler.addIceCandidate(candidate)),
          pull.map(JSON.stringify),
          tap(console.log),
          pull.drain(o => {
            console.log("Send TrickleCandidate");
          })
        );
      },
      requestOfferSDP: () => {
        pull(
          pullPromise.source(this.msPeerHandler.getRoomList()),
          pull.map(o => {
            let list = o.filter(
              room =>
                this.msPeerHandler._room.id !== room.room &&
                room.num_participants > 0
            );
            return list[0];
          }),
          pullPromise.through(o => this.msPeerHandler.getRoomDetail(o.room)),
          pullPromise.through(o => this.msPeerHandler._join(o)),
          pull.map(o => {
            return {
              type: "responseOfferSDP",
              jsep: o
            };
          }),
          tap(console.log),
          stringify(),
          conn
        );
      }
    };
    events[event.request] && events[event.request](event);
  }
}

module.exports = MediaServer;
