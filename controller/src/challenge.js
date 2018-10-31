const randomString = function (len) {
  var charSet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var randomString = "";
  for (var i = 0; i < len; i++) {
    var randomPoz = Math.floor(Math.random() * charSet.length);
    randomString += charSet.substring(randomPoz, randomPoz + 1);
  }
  return randomString;
};

module.exports = {
  create: () => ({
    janus: "create",
    transaction: randomString(12)
  }),
  attach: obj => ({
    janus: "attach",
    opaque_id: "videoroomtest-oxiuc88HQWG7",
    plugin: "janus.plugin.videoroom",
    session_id: obj.data.id,
    transaction: randomString(12)
  }),
  message: obj => ({
    janus: "message",
    body: {
      request: "create",
      room: obj.roomId,
      videocodec: "H264",
      audiocode: "opus",
      notify_joining: true
    },
    opaque_id: "videoroomtest-oxiuc88HQWG7",
    plugin: "janus.plugin.videoroom",
    handle_id: obj.data.id,
    session_id: obj.session_id,
    transaction: randomString(12)
  })
};
