const spawn = require("child_process").spawn;
const janusProcessname =  __dirname + "/bin/janus_standalone/run.sh";
//const janusCfg = "/opt/janus/etc/janus/janus.cfg";
const janusArgs = [];

class Janus {
  constructor() {
    //super();
    this._runJanus();
  }
  _runJanus() {
    console.log("run janus");

    /*if (this._minRtpPort && this._maxRtpPort) {
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
    }*/

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
    console.log("janus: pid=" + this._child.pid);
    this._child.stdout.on("data", buffer => {
      if (buffer.slice(-1) == "\n") {
        console.log(buffer.subarray(0, buffer.length - 1).toString());
      } else {
        console.log(buffer.toString());
      }
    });

    this._child.stderr.on("data", buffer => {
      if (buffer.slice(-1) == "\n") {
        console.error(
          "janus: stderr=" + buffer.subarray(0, buffer.length - 1).toString()
        );
      } else {
        console.error("janus: stderr=" + buffer.toString());
      }
    });

    this._child.on("exit", (code, signal) => {
      console.log("janus: exit: code=" + code + " signal=" + signal);
      this._child = null;
      //this.close();
      //this.emit("down");
    });

    this._child.on("error", error => {
      console.error("janus: error=" + error);
      this._child = null;
      // this.close();
      // this.emit("down");
    });
  }
}
module.exports = Janus;
