const pull = require("pull-stream");
const wsSource = require("pull-ws/source");
const wsSink = require("pull-ws");
const challenge = require("./challenge");
const { tap } = require("pull-tap");
const Websocket = require("ws");
const Pushable = require("pull-pushable");

class MediaServer {
  constructor(_wsUrl, _protocol = "janus-protocol") {
    if (!_wsUrl) throw new Error("NO webSocket url.");
    this.sendStream = Pushable();
    this.errorStream = Pushable();
    this.socket = new Websocket(_wsUrl, _protocol);
    this.socket.on("error", this.errorStream.push);
    this.socket.on("open", () => {
      this.sendStreamInit();
      this.processReceiveInit();
      this.sendStream.push(challenge.create());
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
      tap(o => console.log("sent:", o)),
      pull.map(JSON.stringify),
      wsSink(this.socket)
    );
  }
  processReceiveInit() {
    //recvStream
    pull(
      wsSource(this.socket),
      pull.map(o => JSON.parse(o)),
      pull.drain(o => {
        console.log("recv:", o);
        if (o.janus === "success") {
          if (!o.session_id) {
            this.sendStream.push(challenge.attach(o));
          } else if (!o.sender) {
            this.sendStream.push(challenge.message({ ...o, roomId: 1 }));
          } else {
            console.log("mediaServer initiated!");
          }
        }
      })
    );
  }
}

module.exports = MediaServer;
