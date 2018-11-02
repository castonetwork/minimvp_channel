const pull = require("pull-stream");
const { tap } = require("pull-tap");
const pullPromise = require("pull-promise");

const transactionQueue = {};
let _sessionId, _handleId, _keepAliveId;
const _plugin = "janus.plugin.videoroom";
const randomString = function(len) {
  var charSet =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  var randomString = "";
  for (var i = 0; i < len; i++) {
    var randomPoz = Math.floor(Math.random() * charSet.length);
    randomString += charSet.substring(randomPoz, randomPoz + 1);
  }
  return randomString;
};

const _createSession = (sendStream, errorStream) => {
  let tId = randomString(12);
  let request = {
    janus: "create",
    transaction: tId
  };
  sendStream.push(request);

  return new Promise((resolve, reject) => {
    transactionQueue[tId] = {
      id: tId,
      success: response => {
        _sessionId = response.data.id;
        //logger.debug("sessionId: " + this._sessionId);
        console.log("_createSession : success");
        console.log(response);
        resolve();
        return true;
      },
      failure: response => {
        errorStream.push("error: fail to create session");
        reject();
        return true;
      }
    };
  });
};
const _attach = (sendStream, errorStream) => {
  let tId = randomString(12);

  let request = {
    janus: "attach",
    session_id: _sessionId,
    plugin: _plugin,
    transaction: tId
  };
  sendStream.push(request);

  return new Promise((resolve, reject) => {
    transactionQueue[tId] = {
      id: tId,
      success: response => {
        //logger.debug('attch: id=' + response.data.id);
        console.log("attch: id=" + response.data.id);
        _handleId = response.data.id;
        resolve();
        return true;
      },
      failure: response => {
        errorStream.push(response.error.reason);
        reject();
        return true;
      }
    };
  });
};
const controllerInit = (sendStream, errorStream) =>
  pull(
    pullPromise.source(_createSession(sendStream, errorStream)),
    pullPromise.through(data => _attach(sendStream, errorStream)),
    pull.map(o => (_keepAliveId = _startKeepAlive(_handleId, sendStream))),
    tap(pull.map(o => console.log("Success Controller Attach to JANUS!"))),
    pull.log()
  );
const _startKeepAlive = (id, sendStream) => {
  let timerId = setInterval(() => {
    let msg = {
      janus: "keepalive",
      session_id: _sessionId,
      handle_id: id,
      transaction: randomString(12)
    };
    sendStream.push(msg);
  }, 30000);

  return timerId;
};

const receive = o => {
  if ("transaction" in o) {
    let tId = o.transaction;
    let t = transactionQueue[tId];
    if (t == undefined) {
      return;
    }

    let isCompleted = true;

    if (o.janus in t) {
      isCompleted = t[o.janus](o);
    } else {
      if ("failure" in t) {
        t.failure(o);
      }
    }

    if (isCompleted) {
      delete transactionQueue[tId];
    }
    return;
  }
};

module.exports = {
  receive,
  controllerInit,
  _createSession,
  _attach,
  _startKeepAlive
};
