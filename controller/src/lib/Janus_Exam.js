"use strict";

const spawn = require("child_process").spawn;
const WebSocket = require("ws");
const EventEmitter = require("events");
const util = require("util");
const urlParse = require("url-parse");
const fs = require("fs");
const logger = require("./logger");

const transactionQueue = {};
const eventQueue = {};

const janusProcessname = "/opt/janus/bin/janus";
const janusCfg = "/opt/janus/etc/janus/janus.cfg";
const janusArgs = [];

function getRandomInt() {
  const minInt32 = 0;
  const maxInt32 = Math.pow(2, 32) - 1;
  return Math.floor(Math.random() * (maxInt32 - minInt32)) + minInt32;
}

class Janus extends EventEmitter {
  constructor(config) {
    super();
    this._child;
    this._ws = null;
    this._wsUrl = "ws://127.0.0.1:8188";
    this._protocol = "janus-protocol";
    this._turnUrl = config.turnUrl;
    this._stunUrl = config.stunUrl;
    this._minRtpPort = config.minRtpPort;
    this._maxRtpPort = config.maxRtpPort;
    this._publicIp = config.publicIp;
    this._noMediaTimer = config.noMediaTimer;
    this._sessionId;
    this._handleId;
    this._keepaliveTimerId;
    this._room = {
      id: null,
      handleId: null,
      keepaliveTimerId: null
    };
    this._publisherId;
    this._handles = {};
    this._forward = {};

    this._useVideoSimulcast = config.useVideoSimulcast;

    if (config.type === "origin") {
      this._plugin = "janus.plugin.videoroom";
    } else {
      this._plugin = "janus.plugin.streaming";
    }

    this._init();
  }

  /**
   * 미디어서버를 종료한다.
   */
  close() {
    this._clearAllHandles();

    if (this._sessionId) {
      this._closeSession();
      this._sessionId = null;
    }

    if (this._keepaliveTimerId) {
      clearInterval(this._keepaliveTimerId);
      this._keepaliveTimerId = null;
    }

    this._stopJanus();
  }

  switch(peer, id) {
    let handleId = peer._msCtx.handleId;
    let tId = this._randomString(12);
    let request = {
      janus: "message",
      session_id: this._sessionId,
      handle_id: handleId,
      transaction: tId,
      body: {
        request: "configure",
        id: 1,
        substream: id
      }
    };
    this._request(JSON.stringify(request));

    return new Promise((resolve, reject) => {
      transactionQueue[tId] = {
        id: tId,
        ack: response => {
          return false;
        },
        event: response => {
          resolve();
          return true;
        }
      };
    });
  }

  /**
   * 방송 room을 생성.
   * janus서버로 create를 전송
   * @param {Object} config
   * @return {Promise}
   */
  createRoom(config) {
    let tId = this._randomString(12);
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
        bitrate: config.bandwidth,
        publishers: 1,
        fir_freq: config.firFreq,
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

    this._request(JSON.stringify(request));

    return new Promise((resolve, reject) => {
      transactionQueue[tId] = {
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
          reject(response.error.reason);
          return true;
        }
      };
    });
  }

  /**
   * 방송 room을 삭제.
   * janus서버로 destroy를 전송
   * @return {Promise}
   */
  closeRoom() {
    let tId = this._randomString(12);
    let request = {
      janus: "message",
      session_id: this._sessionId,
      handle_id: this._handleId,
      transaction: tId,
      body: {
        request: "destroy"
      }
    };

    if (this._plugin === "janus.plugin.videoroom") {
      request.body.room = this._room.id;
    } else {
      // this._plugin === "janus.plugin.streaming"
      request.body.id = this._room.id;
    }

    this._request(JSON.stringify(request));
    return new Promise((resolve, reject) => {
      transactionQueue[tId] = {
        id: tId,
        success: response => {
          resolve();
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
   * room에 peer를 join한다.
   * peer를 추가하기 위해서 먼저, attach로 handle을 생성한다. handle 생성이 완료되면 join 메시지를 janus로 전송
   * @param {Peer} peer
   * @return {Promise}
   */
  addPeer(peer) {
    return new Promise((resolve, reject) => {
      this._attach()
        .then(id => {
          peer._msCtx.handleId = id;

          this._handles[id] = {
            id: id,
            type: peer.isCaster() ? "publisher" : "listener",
            keepaliveTimerId: null,
            localSdp: null,
            peer: peer
          };

          this._handles[id].keepaliveTimerId = this._startKeepAlive(id);

          if (this._plugin === "janus.plugin.videoroom") {
            return this._join(peer);
          } else {
            return this._watch(peer);
          }
        })
        .then(() => {
          resolve();
        })
        .catch(e => {
          reject(e);
        });
    });
  }

  /**
   * room에서 peer를 leave한다.
   * janus로 leave 메시지를 전송. leave가 완료되면 handle 삭제
   * @param {Peer} peer
   * @returns {Promise}
   */
  delPeer(peer) {
    return new Promise((resolve, reject) => {
      let promise;
      if (this._plugin === "janus.plugin.videoroom") {
        promise = this._leave(peer);
      } else {
        promise = this._stop(peer);
      }

      promise
        .then(() => {
          let handleId = peer._msCtx.handleId;

          if (this._handles[handleId]) {
            this._stopKeepAlive(handleId);
            delete this._handles[handleId];
            return this._detach(handleId);
          } else {
            resolve();
          }
        })
        .then(() => {
          resolve();
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  /**
   * remote sdp를 set한다.
   * janus로 configue 메시지 전송
   * @param {Peer} peer
   * @param {String} sdpType
   * @param {String} sdp
   * @returns {Promise}
   */
  setRemoteSdp(peer, sdpType, sdp) {
    return new Promise((resolve, reject) => {
      this._configure(peer, sdpType, sdp)
        .then(answer => {
          resolve(answer);
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  /**
   * offer SDP를 생성한다.
   * 직접 offer를 janus쪽에 요청하는 것이 아니다.
   * setRemoteSdp에 의해서 offer가 저장된다. (publisher는 이 함수가 필요없음.)
   * @param {Peer} peer
   * @returns {Promise}
   */
  createOffer(peer) {
    let sdp = this._handles[peer._msCtx.handleId].localSdp;
    return new Promise((resolve, reject) => {
      if (sdp) {
        resolve(sdp);
      } else {
        reject("no local sdp");
      }
    });
  }

  /**
   * answer SDP를 생성한다.
   * 직접 answer를 janus쪽에 요청하는 것이 아니다.
   * join 완료시에 offer가 저장된다. (listener는 이 함수가 필요없음)
   * @param {Peer} peer
   * @returns {Promise}
   */
  createAnswer(peer) {
    let sdp = this._handles[peer._msCtx.handleId].localSdp;
    return new Promise((resolve, reject) => {
      if (sdp) {
        resolve(sdp);
      } else {
        reject("no local sdp");
      }
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
  addIceCandidate(peer, sdpMid, sdpMLineIndex, candidate) {
    let tId = this._randomString(12);
    let handleId = peer._msCtx.handleId;

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

    this._request(JSON.stringify(request));
    return new Promise((resolve, reject) => {
      transactionQueue[tId] = {
        id: tId,
        ack: response => {
          return true;
        }
      };
    });
  }

  /**
   * Start RTP forward
   * @param {Object} configure
   * @returns {Promise}
   */
  startForward(config) {
    let tId = this._randomString(12);
    let request = {
      janus: "message",
      session_id: this._sessionId,
      handle_id: this._handleId,
      transaction: tId,
      body: {
        request: "rtp_forward",
        transaction: tId,
        host: config.dest,
        room: this._room.id,
        publisher_id: this._publisherId,
        video_port: config.video.port,
        video_ptype: config.video.pt,
        video_ssrc: getRandomInt(),
        audio_port: config.audio.port,
        audio_ptype: config.audio.pt
      }
    };

    if (this._useVideoSimulcast === true) {
      request.body.video_port_2 = config.video.port + 2;
      request.body.video_ssrc_2 = request.body.video_ssrc + 1;
      request.body.video_ptype_2 = config.video.pt;
      request.body.video_port_3 = config.video.port + 4;
      request.body.video_ssrc_3 = request.body.video_ssrc + 2;
      request.body.video_ptype_3 = config.video.pt;
    }

    this._request(JSON.stringify(request));

    return new Promise((resolve, reject) => {
      transactionQueue[tId] = {
        id: tId,
        success: response => {
          if ("error" in response.plugindata.data) {
            reject(response.plugindata.data.error);
            return true;
          }
          this._forward[config.id] = {
            audioStreamId: response.plugindata.data.rtp_stream.audio_stream_id,
            videoStreamId: response.plugindata.data.rtp_stream.video_stream_id
          };
          if ("video_stream_id_2" in response.plugindata.data.rtp_stream) {
            this._forward[config.id].videoStreamId2 =
              response.plugindata.data.rtp_stream.video_stream_id_2;
          }
          if ("video_stream_id_3" in response.plugindata.data.rtp_stream) {
            this._forward[config.id].videoStreamId3 =
              response.plugindata.data.rtp_stream.video_stream_id_3;
          }
          resolve();
          return true;
        },
        failure: response => {
          reject(response.error.reason);
          return true;
        }
      };
    });
  }

  /**
   * Stop RTP forward
   * @param {Object} configure
   */
  stopForwards(config) {
    if (this._forward[config.id] === undefined) {
      logger.error(`stopForwards() fail. not found id:${config.id}`);
      return;
    }

    const audioStreamId = this._forward[config.id].audioStreamId;
    const videoStreamId = this._forward[config.id].videoStreamId;
    const videoStreamId2 = this._forward[config.id].videoStreamId2;
    const videoStreamId3 = this._forward[config.id].videoStreamId3;

    this.stopForward(audioStreamId);
    this.stopForward(videoStreamId);
    if (videoStreamId2) {
      this.stopForward(videoStreamId2);
    }
    if (videoStreamId3) {
      this.stopForward(videoStreamId3);
    }

    delete this._forward[config.id];
  }

  /**
   * Stop RTP forward internal
   * @param {String} streamId
   * @returns {Promise}
   */
  stopForward(streamId) {
    let tId = this._randomString(12);
    let request = {
      janus: "message",
      session_id: this._sessionId,
      handle_id: this._handleId,
      transaction: tId,
      body: {
        request: "stop_rtp_forward",
        transaction: tId,
        room: this._room.id,
        publisher_id: this._publisherId,
        stream_id: streamId
      }
    };
    this._request(JSON.stringify(request));

    return new Promise((resolve, reject) => {
      transactionQueue[tId] = {
        id: tId,
        success: response => {
          resolve();
          return true;
        },
        failure: response => {
          reject(response.error.reason);
          return true;
        }
      };
    });
  }

  /**
   * List RTP forwards
   */
  listForwards() {
    let tId = this._randomString(12);
    let request = {
      janus: "message",
      session_id: this._sessionId,
      handle_id: this._handleId,
      transaction: tId,
      body: {
        request: "listforwarders",
        transaction: tId,
        room: this._room.id
      }
    };
    this._request(JSON.stringify(request));

    return new Promise((resolve, reject) => {
      transactionQueue[tId] = {
        id: tId,
        success: response => {
          resolve();
          return true;
        },
        failure: response => {
          reject(response.error.reason);
          return true;
        }
      };
    });
  }

  /* internal method */

  /**
   * janus 서버를 child process로 띄우고 websocket으로 연결한다.
   */
  _init() {
    if (this._turnUrl) {
      /**
       * url-parse로 url 파싱시에 protocol이 없으면 파싱이 안됨. turn://을 추가해서 파싱
       */
      let t = "turn://" + this._turnUrl;
      let turnUrl = urlParse(t, true);
      fs.appendFileSync(janusCfg, "\nturn_server = " + turnUrl.hostname);
      fs.appendFileSync(janusCfg, "\nturn_port = " + turnUrl.port);
      fs.appendFileSync(janusCfg, "\nturn_type = udp");
      fs.appendFileSync(janusCfg, "\nturn_user = " + turnUrl.username);
      fs.appendFileSync(janusCfg, "\nturn_pwd = " + turnUrl.password);
    }

    this._runJanus();

    let retryTimeout = 5000;
    this._connectJanus(retryTimeout);
  }

  /**
   * janus 서버를 실행한다.
   */
  _runJanus() {
    logger.debug("run janus");

    if (this._minRtpPort && this._maxRtpPort) {
      janusArgs.push(
        util.format(`--rtp-port-range=${this._minRtpPort}-${this._maxRtpPort}`)
      );
    }

    if (this._stunUrl) {
      janusArgs.push(util.format(`--stun-server=${this._stunUrl}`));
    }

    if (this._publicIp) {
      janusArgs.push(util.format(`--nat-1-1=${this._publicIp}`));
    }

    if (this._noMediaTimer) {
      janusArgs.push(util.format(`--no-media-timer=${this._noMediaTimer}`));
    }

    let spawnOptions = {
      detached: false,
      /*
             * fd 0 (stdin)   : Just ignore it.
             * fd 1 (stdout)  : Pipe it for 3rd libraries in the worker.
             *                  that log their own stuff.
             * fd 2 (stderr)  : Same as stdout.
             */
      stdio: ["ignore", "pipe", "pipe"]
      //    timeout: 3000,
      //    killSignal: 'SIGKILL'
    };

    this._child = spawn(janusProcessname, janusArgs, spawnOptions);
    logger.debug("janus: pid=" + this._child.pid);
    this._child.stdout.on("data", buffer => {
      if (buffer.slice(-1) == "\n") {
        logger.debug(buffer.subarray(0, buffer.length - 1).toString());
      } else {
        logger.debug(buffer.toString());
      }
    });

    this._child.stderr.on("data", buffer => {
      if (buffer.slice(-1) == "\n") {
        logger.error(
          "janus: stderr=" + buffer.subarray(0, buffer.length - 1).toString()
        );
      } else {
        logger.error("janus: stderr=" + buffer.toString());
      }
    });

    this._child.on("exit", (code, signal) => {
      logger.info("janus: exit: code=" + code + " signal=" + signal);
      this._child = null;
      this.close();
      this.emit("down");
    });

    this._child.on("error", error => {
      logger.error("janus: error=" + error);
      this._child = null;
      this.close();
      this.emit("down");
    });
  }

  /**
   * janus 서버를 종료한다.
   */
  _stopJanus() {
    logger.debug("stop janus ... ");

    if (this._child) {
      this._child.removeAllListeners("exit");
      this._child.removeAllListeners("error");
      this._child.on("error", () => null);

      this._child.stdout.pause();

      this._child.kill("SIGKILL");
    } else {
      logger.debug("already stopped janus");
    }
    this._child = null;
  }

  /**
   * janus 서버와 websocket 연결
   */
  _connectJanus(retryTimeout) {
    logger.debug("connecting to media server: " + this._wsUrl);
    this._ws = new WebSocket(this._wsUrl, this._protocol);
    this._ws.on("error", () => {
      // janus 서버가 websocket server를 생성할 때까지 계속 시도한다.
      retryTimeout = retryTimeout - 1000;
      if (retryTimeout <= 0) {
        this._stopJanus();
        logger.debug("mediaserver no response.");
        this.emit("down");
      }
      setTimeout(() => {
        this._connectJanus();
      }, 1000);
    });

    this._ws.on("close", () => {});

    this._ws.on("open", () => {
      logger.debug("connected: " + this._wsUrl);
      this._ws.onerror = e => {
        logger.error("janus websocket error: " + e);
        this._stopJanus();
        this.emit("down");
      };
      this._ws.onclose = () => {
        logger.info("janus websocket close");
        this._stopJanus();
        this.emit("down");
      };
      this._ws.onmessage = e => {
        logger.debug(`\x1b[33mRM>:${e.data}\x1b[0m`);
        let response = JSON.parse(e.data);

        if ("transaction" in response) {
          let tId = response.transaction;
          let t = transactionQueue[tId];
          if (t == undefined) {
            return;
          }

          let isCompleted = true;

          if (response.janus in t) {
            isCompleted = t[response.janus](response);
          } else {
            if ("failure" in t) {
              t.failure(response);
            }
          }

          if (isCompleted) {
            delete transactionQueue[tId];
          }
          return;
        }

        if (response.janus === "webrtcup") {
          let handleId = response.sender;
          if (this._handles[handleId].type === "listener") {
            /**
             * listener인 경우에는 webrtcup 이벤트 후에 start를 시켜줘야 한다.
             */
            this._start(handleId);
          }
          return;
        }

        if (response.janus === "media") {
          let handleId = response.sender;
          if (this._handles[handleId]) {
            let peerId = this._handles[handleId].peer._id;
            let roomId = this._handles[handleId].peer._roomId;

            if (response.receiving === true) {
              this.emit("startMedia", roomId, peerId);
            } else {
              this.emit("noMedia", roomId, peerId);
            }
          }
          return;
        }
      };

      /**
       * janus와 websocket이 연결 완료되면
       *  - session을 생성
       *  - 메인 handle를 생성
       *  - 메인 handle에 대한 keep-alive 메시지 전송
       */
      Promise.resolve()
        .then(() => {
          return this._createSession();
        })
        .then(() => {
          return this._attach();
        })
        .then(id => {
          this._handleId = id;
          this._keepaliveTimerId = this._startKeepAlive(this._handleId);
          this.emit("up");
        });
    });
  }

  /**
   * janus session을 생성한다.
   * @returns {Promise}
   */
  _createSession() {
    let tId = this._randomString(12);
    let request = {
      janus: "create",
      transaction: tId
    };
    this._request(JSON.stringify(request));

    return new Promise((resolve, reject) => {
      transactionQueue[tId] = {
        id: tId,
        success: response => {
          this._sessionId = response.data.id;
          logger.debug("sessionId: " + this._sessionId);
          resolve();
          return true;
        },
        failure: response => {
          logger.error("error: fail to create session");
          reject();
          return true;
        }
      };
    });
  }

  /**
   * janus session을 삭제한다.
   */
  _closeSession() {
    let tId = this._randomString(12);
    let request = {
      janus: "close",
      session_id: this._sessionId,
      transaction: tId
    };
    this._request(JSON.stringify(request));
  }

  /**
   * videoroom API를 사용하기 위해서 handle를 생성한다.
   * janus서버로 attach 메시지를 전송
   * @returns {Promise}
   */
  _attach() {
    let tId = this._randomString(12);

    let request = {
      janus: "attach",
      session_id: this._sessionId,
      plugin: this._plugin,
      transaction: tId
    };
    this._request(JSON.stringify(request));

    return new Promise((resolve, reject) => {
      transactionQueue[tId] = {
        id: tId,
        success: response => {
          logger.debug("attch: id=" + response.data.id);
          resolve(response.data.id);
          return true;
        },
        failure: response => {
          reject(response.error.reason);
          return true;
        }
      };
    });
  }

  /**
   * handle를 삭제한다.
   * janus서버로 detach 메시지를 전송
   * @param {Number} handleId
   *
   */
  _detach(handleId) {
    let tId = this._randomString(12);
    let request = {
      janus: "detach",
      session_id: this._sessionId,
      handle_id: handleId,
      transaction: tId
    };

    this._request(JSON.stringify(request));
    return new Promise((resolve, reject) => {
      transactionQueue[tId] = {
        id: tId,
        success: response => {
          resolve();
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
   *
   *
   */

  _watch(peer) {
    let handleId = peer._msCtx.handleId;
    let tId = this._randomString(12);

    let request = {
      janus: "message",
      session_id: this._sessionId,
      handle_id: handleId,
      transaction: tId,
      body: {
        request: "watch",
        id: 1,
        offer_audio: true,
        offer_video: true,
        offer_data: false
      }
    };

    this._request(JSON.stringify(request));
    return new Promise((resolve, reject) => {
      transactionQueue[tId] = {
        id: tId,
        ack: response => {
          return false;
        },
        event: response => {
          if (this._handles[handleId] == null) {
            logger.error("handle(" + handleId + ") is null");
            reject("null handle");
            return true;
          }

          if ("error_code" in response.plugindata.data) {
            reject(
              "cmd:watch " +
                " code:" +
                response.plugindata.data.error_code +
                ":" +
                " message:" +
                response.plugindata.data.error
            );
          } else {
            if ("jsep" in response) {
              this._handles[handleId].localSdp = response.jsep.sdp;
              logger.debug(this._handles[handleId].localSdp);
            }

            resolve();
          }
          return true;
        },
        failure: response => {
          reject("cmd:watch response:" + response.janus);
          return true;
        }
      };
    });
  }

  _stop(peer) {
    let tId = this._randomString(12);
    let handleId = peer._msCtx.handleId;

    let request = {
      janus: "message",
      session_id: this._sessionId,
      handle_id: handleId,
      transaction: tId,
      body: {
        request: "stop",
        id: 1
      }
    };

    this._request(JSON.stringify(request));
    return new Promise((resolve, reject) => {
      transactionQueue[tId] = {
        id: tId,
        ack: response => {
          resolve();
          return true;
        },
        error: response => {
          reject(response.error.reason);
          return true;
        },
        event: response => {
          reject("event:" + response.plugindata.data.result.status);
          return true;
        },
        failure: response => {
          reject(response.error.reason);
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
  _join(peer) {
    let handleId = peer._msCtx.handleId;
    let tId = this._randomString(12);

    let request = {
      janus: "message",
      session_id: this._sessionId,
      handle_id: handleId,
      transaction: tId,
      body: {
        request: "join",
        room: this._room.id,
        ptype: peer.isCaster() ? "publisher" : "listener",
        video: true,
        audio: true
      }
    };

    if (!peer.isCaster()) {
      request.body.feed = this._publisherId;
    }

    this._request(JSON.stringify(request));

    return new Promise((resolve, reject) => {
      transactionQueue[tId] = {
        id: tId,
        ack: response => {
          return false;
        },
        event: response => {
          if (this._handles[handleId] == null) {
            logger.error("handle(" + handleId + ") is null");
            reject("null handle");
            return true;
          }

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
              this._handles[handleId].localSdp = response.jsep.sdp;
            }

            if (peer.isCaster()) {
              this._publisherId = response.plugindata.data.id;
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
   * leave 메시지를 janus 서버로 전송한다.
   * @param {Peer} peer
   * @returns {Promise}
   */
  _leave(peer) {
    let tId = this._randomString(12);
    let handleId = peer._msCtx.handleId;

    let request = {
      janus: "message",
      session_id: this._sessionId,
      handle_id: handleId,
      transaction: tId,
      body: {
        request: "leave",
        room: this._room.id
      }
    };

    this._request(JSON.stringify(request));
    return new Promise((resolve, reject) => {
      transactionQueue[tId] = {
        id: tId,
        ack: response => {
          return false;
        },
        event: response => {
          resolve();
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
   * start 메시지를 janus서버로 전송
   * @param {Number} id
   */
  _start(id) {
    let tId = this._randomString(12);
    let request = {
      janus: "message",
      session_id: this._sessionId,
      handle_id: id,
      transaction: tId,
      body: {
        request: "start",
        room: this._room.id
      }
    };

    this._request(JSON.stringify(request));
  }

  /**
   * configure 메시지를 janus 서버로 전송
   * local SDP를 얻어오기 위해 사용한다.
   * @param {Peer} peer
   * @param {String} sdpType
   * @param {Strinf} sdp
   * @returns {Promise}
   */
  _configure(peer, sdpType, sdp) {
    let tId = this._randomString(12);

    let handleId = peer._msCtx.handleId;

    let request = {
      janus: "message",
      session_id: this._sessionId,
      handle_id: handleId,
      transaction: tId,
      body: {
        request: "configure",
        room: this._room.id,
        ptype: this._handles[handleId].type,
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

    if (!peer.isCaster()) {
      request.body.feed = this._publisherId;
    }

    this._request(JSON.stringify(request));

    return new Promise((resolve, reject) => {
      transactionQueue[tId] = {
        id: tId,
        ack: response => {
          return false;
        },
        event: response => {
          let handleId = response.sender;

          if (this._handles[handleId] == null) {
            logger.error("handle(" + handleId + ") is null");
            reject("null handle");
            return true;
          }

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
              this._handles[handleId].localSdp = response.jsep.sdp;
            }
            resolve(_sdp);
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
   * keepalive 메시지를 전송 시작
   * @param {Number} id
   * @returns {Number}
   */
  _startKeepAlive(id) {
    let timerId = setInterval(() => {
      let msg = {
        janus: "keepalive",
        session_id: this._sessionId,
        handle_id: id,
        transaction: this._randomString(12)
      };
      this._request(JSON.stringify(msg));
    }, 30000);

    return timerId;
  }

  /**
   * keepalive 메시지 전송을 정지
   * @param {Number} id
   */
  _stopKeepAlive(id) {
    if (this._handles[id] == null) return;
    clearInterval(this._handles[id].keepaliveTimerId);
  }

  /**
   * 모든 handle를 지운다.
   * TODO:
   *  - detach를 해야 하나?
   */
  _clearAllHandles() {
    for (let i in this._handles) {
      logger.debug("handle:" + i);
      this._stopKeepAlive(i);
    }

    this._handles = {};
  }

  /**
   * janus로 메시지 전송
   * @param {String} request
   */
  _request(request) {
    logger.debug(`\x1b[33mRM<:${request}\x1b[0m`);
    try {
      this._ws.send(request);
    } catch (e) {
      logger.error("send fail:" + e);
    }
  }

  /**
   * transaction ID 생성
   * @param {Number} len
   * @returns {String}
   */
  _randomString(len) {
    var charSet =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    var randomString = "";
    for (var i = 0; i < len; i++) {
      var randomPoz = Math.floor(Math.random() * charSet.length);
      randomString += charSet.substring(randomPoz, randomPoz + 1);
    }
    return randomString;
  }
}

module.exports = Janus;
