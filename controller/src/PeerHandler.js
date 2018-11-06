const pull = require("pull-stream");
const { tap } = require("pull-tap");
const pullPromise = require("pull-promise");
const chance = require("chance").Chance();

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
    this._conn;
    this._localSdp;
    this._publisherId;
    this._useVideoSimulcast = false; //config.useVideoSimulcast;
    this._plugin =
      //config.type === "origin"
      "origin" === "origin"
        ? "janus.plugin.videoroom"
        : "janus.plugin.streaming";
    this.transactionQueue = {};
    this.init = this.init.bind(this);
    this._createSession = this._createSession.bind(this);
    this._attach = this._attach.bind(this);
    this._startKeepAlive = this._startKeepAlive.bind(this);
    this.receive = this.receive.bind(this);
  }

  init() {
    return pull(
      pullPromise.source(this._createSession()),
      pullPromise.through(o => this._attach()),
      pull.map(id => {
        this._handleId = id;
        this._keepaliveTimerId = this._startKeepAlive(this._handleId);
      }),
      pullPromise.through(o => this.createRoom()),
      pullPromise.through(roomId => this._join()),
      pull.drain(o => console.log("Success Controller Attach to JANUS!"))
    );
  }

  _createSession() {
    let tId = chance.guid();
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
    let tId = chance.guid();
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
          resolve(response.data.id);
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
        transaction: chance.guid()
      };
      this._sendStream.push(msg);
    }, 30000);

    return timerId;
  }

  createRoom() {
    let tId = chance.guid();
    let request = {
      janus: "message",
      session_id: this._sessionId,
      handle_id: this._handleId,
      transaction: tId,
      request: {}
    };

    if (this._plugin === "janus.plugin.videoroom") {
      request.body = {
        request: "create",
        description: "remon",
        //   transaction: tId,
        bitrate: 5242880,
        publishers: 1,
        fir_freq: 1,
        is_private: false,
        audiocodec: "opus",
        videocodec: "H264",
        video: true,
        audio: true,
        notify_joining: true,
        playoutdelay_ext: false,
        videoorient_ext: false
      };
      if (this._useVideoSimulcast === true) {
        request.body.videocodec = "VP8";
      }
    } else {
      // this._plugin === "janus.plugin.streaming"
      request.body = {
        request: "create",
        type: "rtp",
        id: 1,
        is_private: false,
        audio: true,
        video: true,
        audiopt: 111,
        audioport: 50000,
        audiortpmap: "opus/48000/2",
        videopt: 100,
        videoport: 50002,
        videoskew: false,
        videortpmap: "H264/90000",
        videofmtp: "profile-level-id=42e01f;packetization-mode=1",
        videosimulcast: false
      };

      if (this._useVideoSimulcast === true) {
        request.body.videoport2 = 50004;
        request.body.videoport3 = 50006;
        request.body.videortpmap = "VP8/90000";
        request.body.videofmtp = "";
        request.body.videosimulcast = true;
      }
    }

    this._sendStream.push(request);

    return new Promise((resolve, reject) => {
      this.transactionQueue[tId] = {
        id: tId,
        success: response => {
          if (this._plugin === "janus.plugin.videoroom") {
            this._room.id = response.plugindata.data.room;
          } else {
            // this._plugin === "janus.plugin.streaming"
            this._room.id = response.plugindata.data.stream.id;
          }
          resolve(this._room.id);
          return true;
        },
        failure: response => {
          this._errorStream.push(response.error.reason);
          return true;
        }
      };
    });
  }

  /**
   * join 메시지를 janus 서버로 전송한다.
   * @param {Peer} peer
   * @returns {Promise}
   */
  _join() {
    let handleId = this._handleId;
    let tId = chance.guid();

    let request = {
      janus: "message",
      session_id: this._sessionId,
      handle_id: handleId,
      transaction: tId,
      body: {
        request: "join",
        room: this._room.id,
        ptype: "publisher", // : "listener",
        video: true,
        audio: true
      }
    };

    this._sendStream.push(request);

    return new Promise((resolve, reject) => {
      this.transactionQueue[tId] = {
        id: tId,
        ack: response => {
          return false;
        },
        event: response => {
          if ("error_code" in response.plugindata.data) {
            reject(
              "cmd:join " +
                " code:" +
                response.plugindata.data.error_code +
                ":" +
                " message:" +
                response.plugindata.data.error
            );
          } else {
            if ("jsep" in response) {
              response.jsep.sdp;
            }

            resolve();
          }
          return true;
        },
        failure: response => {
          reject("cmd:join response:" + response.janus);
          return true;
        }
      };
    });
  }

  /**
   * configure 메시지를 janus 서버로 전송
   * local SDP를 얻어오기 위해 사용한다.
   * @param {Peer} peer
   * @param {String} sdpType
   * @param {Strinf} sdp
   * @returns {Promise}
   */
  _configure(sdpType, sdp) {
    let tId = chance.guid();

    let handleId = this._handleId;

    let request = {
      janus: "message",
      session_id: this._sessionId,
      handle_id: handleId,
      transaction: tId,
      body: {
        request: "configure",
        room: this._room.id,
        ptype: "publisher",
        video: true,
        audio: true
      }
    };

    if (sdp) {
      request.jsep = {
        type: sdpType,
        sdp: sdp
      };
    }

    this._sendStream.push(request);

    return new Promise((resolve, reject) => {
      this.transactionQueue[tId] = {
        id: tId,
        ack: response => {
          return false;
        },
        event: response => {
          let handleId = response.sender;

          if ("error_code" in response.plugindata.data) {
            reject(
              response.plugindata.data.error_code +
                ":" +
                response.plugindata.data.error
            );
          } else {
            let _sdp;
            if ("jsep" in response) {
              _sdp = response.jsep.sdp;
              this._localSdp = response.jsep.sdp;
            }
            resolve(response.jsep);
          }
          return true;
        },
        failure: response => {
          reject();
          return true;
        }
      };
    });
  }
  /**
   * ICE candidate를 janus로 전송한다.
   * janus로 trickle 메시지 전송
   * @param {Peer} peer
   * @param {String} sdpMid
   * @param {String} sdpMLineIndex
   * @param {String} candidate
   * @returns {Promise}
   */
  addIceCandidate(candidates) {
    const { sdpMid, sdpMLineIndex, candidate } = candidates;
    let tId = chance.guid();
    let handleId = this._handleId;

    let request = {
      janus: "trickle",
      session_id: this._sessionId,
      handle_id: handleId,
      transaction: tId,
      candidate: {
        sdpMid: sdpMid,
        sdpMLineIndex: sdpMLineIndex,
        candidate: candidate
      }
    };

    this._sendStream.push(request);
    return new Promise((resolve, reject) => {
      this.transactionQueue[tId] = {
        id: tId,
        ack: response => {
          return true;
        }
      };
    });
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
