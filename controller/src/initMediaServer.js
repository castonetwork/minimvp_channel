const pull = require("pull-stream");
const wsSource = require('pull-ws/source');
const wsSink = require("pull-ws");
const challenge = require('./challenge');
const {tap} = require("pull-tap");

module.exports = ({sendStream, socket}) => {
  // sendStream
  pull(
    sendStream,
    tap(o => console.log("sent:", o)),
    pull.map(JSON.stringify),
    wsSink(socket)
  );
  // recvStream
  pull(
    wsSource(socket),
    pull.map(o => JSON.parse(o)),
    pull.drain(o => {
      console.log("recv:", o);
      if (o.janus === 'success') {
        if (!o.session_id) {
          sendStream.push(challenge.attach(o))
        } else if (!o.sender) {
          sendStream.push(challenge.message({...o, roomId: 1}))
        } else {
          console.log("mediaServer initiated!");
        }
      }
    })
  );
  sendStream.push(challenge.create());
};
