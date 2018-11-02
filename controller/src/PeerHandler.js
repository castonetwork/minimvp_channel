const pull = require("pull-stream");
const { tap } = require("pull-tap");
const pullPromise = require("pull-promise");

class PeerHandler {
  constructor(_sendStream, _errorStream) {
    this._sendStream = _sendStream;
    this._errorStream = _errorStream;
    this._sessionId;
    this._handleId;
    this._keepaliveTimerId;
    this._room = {
      id: null,
      handleId: null,
      keepaliveTimerId: null
    };
    this._publisherId;
    this._useVideoSimulcast = false; //config.useVideoSimulcast;
    this._plugin =
      //config.type === "origin"
      "origin" === "origin"
        ? "janus.plugin.videoroom"
        : "janus.plugin.streaming";
    this.transactionQueue = {};
    this.init = this.init.bind(this);
    this.randomString = this.randomString.bind(this);
    this._createSession = this._createSession.bind(this);
    this._attach = this._attach.bind(this);
    this._startKeepAlive = this._startKeepAlive.bind(this);
    this.receive = this.receive.bind(this);
  }
  init() {
    return pull(
      pullPromise.source(this._createSession()),
      pullPromise.through(o => this._attach()),
      pull.map(
        o => (this._keepaliveTimerId = this._startKeepAlive(this._handleId))
      ),
      pull.drain(o => console.log("Success Controller Attach to JANUS!"))
    );
  }

  randomString(len) {
    var charSet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var randomString = "";
    for (var i = 0; i < len; i++) {
      var randomPoz = Math.floor(Math.random() * charSet.length);
      randomString += charSet.substring(randomPoz, randomPoz + 1);
    }
    return randomString;
  }

  _createSession() {
    let tId = this.randomString(12);
    let request = {
      janus: "create",
      transaction: tId
    };
    this._sendStream.push(request);
    return new Promise((resolve, reject) => {
      this.transactionQueue[tId] = {
        id: tId,
        success: response => {
          this._sessionId = response.data.id;
          //logger.debug("sessionId: " + this._sessionId);
          console.log("_createSession : success");
          console.log(response);
          resolve();
          return true;
        },
        failure: response => {
          this._errorStream.push("error: fail to create session");
          reject();
          return true;
        }
      };
    });
  }

  _attach() {
    let tId = this.randomString(12);
    let request = {
      janus: "attach",
      session_id: this._sessionId,
      plugin: this._plugin,
      transaction: tId
    };
    this._sendStream.push(request);
    return new Promise((resolve, reject) => {
      this.transactionQueue[tId] = {
        id: tId,
        success: response => {
          //logger.debug('attch: id=' + response.data.id);
          console.log("attch: id=" + response.data.id);
          this._handleId = response.data.id;
          resolve();
          return true;
        },
        failure: response => {
          this._errorStream.push(response.error.reason);
          reject();
          return true;
        }
      };
    });
  }
  _startKeepAlive(id) {
    let timerId = setInterval(() => {
      let msg = {
        janus: "keepalive",
        session_id: this._sessionId,
        handle_id: id,
        transaction: this.randomString(12)
      };
      this._sendStream.push(msg);
    }, 30000);

    return timerId;
  }

  receive(o) {
    if ("transaction" in o) {
      let tId = o.transaction;
      let t = this.transactionQueue[tId];
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
        delete this.transactionQueue[tId];
      }
      return;
    }
  }
}

module.exports = PeerHandler;
