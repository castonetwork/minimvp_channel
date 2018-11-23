const Pushable = require("pull-pushable");
const Notify = require("pull-notify");

/* janus websocket Interface */
const sendStream = Pushable();
const recvNotify = Notify();

module.exports = {
  sendStream,
  recvNotify
};