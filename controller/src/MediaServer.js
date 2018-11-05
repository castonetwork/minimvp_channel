const pull = require("pull-stream");
const wsSource = require("pull-ws/source");
const wsSink = require("pull-ws");
const PeerHandler = require("./PeerHandler");
const { tap } = require("pull-tap");
const Websocket = require("ws");
const Pushable = require("pull-pushable");

class MediaServer {
  constructor(_wsUrl, _protocol = "janus-protocol", _config) {
    console.log(this);
    if (!_wsUrl) throw new Error("NO webSocket url.");
    this.wsUrl = _wsUrl;
    this.protocal = _protocol;
    this.msPeerHandler;
    this.peers = {};
    this.sessionId;
    this.sendStream = Pushable();
    this.errorStream = Pushable();

    this.getSendStream = this.getSendStream.bind(this);
    this.getErrorStream = this.getErrorStream.bind(this);
    this.errorStreamInit = this.errorStreamInit.bind(this);
    this.sendStreamInit = this.sendStreamInit.bind(this);
    this.processReceiveInit = this.processReceiveInit.bind(this);

    this.socket = new Websocket(this.wsUrl, this.protocal);
    this.errorStreamInit();
    this.socket.on("error", this.errorStream.push);
    this.socket.on("open", () => {
      this.msPeerHandler = new PeerHandler(this.sendStream, this.errorStream);
      this.sendStreamInit();
      this.processReceiveInit();
      this.msPeerHandler.init();
    });
  }
  getSendStream() {
    return this.sendStream;
  }
  getErrorStream() {
    return this.errorStream;
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
}

module.exports = MediaServer;
