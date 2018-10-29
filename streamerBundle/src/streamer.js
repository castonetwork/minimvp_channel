const Janus = require('./janus.es.js').default;
var roomId = parseInt(document.querySelector(".roomId").value, 10);
var sfutest = null;
var opaqueId = "videoroomtest-"+Janus.randomString(12);
const endPoint = "http://13.209.96.83:8088/janus";


let init = ()=>{
    //setting janus.Js
    Janus.init({debug :"all", callback : ()=>{
        Janus.log("Initiating Janus....");
        return new Promise((res, rej)=>{
            res();
        });
    }})
    .then(()=>{
        //Connect to Janus Server....
    })


    //setting janus.Js
    Janus.init({debug :"all", callback : function(){
        Janus.log("Initiating Janus....");
        let janus = new Janus({
            server : endPoint,
            success : x=>{
                Janus.log("Success Connect to Janus Server....");
                janus.attach({
                    plugin : "janus.plugin.videoroom",
                    opaqueId : opaqueId,
                    success : (pluginHandle)=>{
                        sfutest = pluginHandle;
                        Janus.log("Plugin attached! (" + sfutest.getPlugin() + ", id=" + sfutest.getId() + ")");
                        /*sfutest.send({message:{request:"create", 
                            room: roomId, 
                            videocodec : "H264",
                            audiocodec : "opus",
                            notify_joining : true
                        }});*/
                    },
                    error : (err)=>{
                        Janus.error(" error attaching plugin", error);
                    },
                    consentDialog : (on)=>{
                        Janus.debug("Consent dialog should be " + (on ? "on" : "off") + " now");
                    },
                    mediaState : (medium, on)=>{
                        Janus.log("Janus " + (on ? "started" : "stopped") + " receiving our " + medium);
                    },
                    webrtcState : (on)=>{
                        Janus.log("Janus says our WebRTC PeerConnection is " + (on ? "up" : "down") + " now");
                    },
                    onmessage : (msg, jsep)=>{
                        Janus.debug(" ::: Got a message (publisher) :::");
                        console.log(msg);
                        if(msg["videoroom"] === "joined"){
                            Janus.debug(" ::: Got a joined (publisher) :::");
                            sfutest.createOffer(
                                {
                                    media: { audioRecv: false, videoRecv: false, audioSend: true, videoSend: true },
                                    simulcast: false,
                                    success: function(jsep) {
                                        Janus.debug("Got publisher SDP!");
                                        Janus.debug(jsep);
                                        var publish = { "request": "configure", 
                                                    "audio": true, 
                                                    "video": true, 
                                                    "videocodec":"H264",
                                                    "audiocodec":"opus",
                                                    "display":"pub"
                                                };
                                        sfutest.send({"message": publish, "jsep": jsep});
                                    },
                                    error: function(error) {
                                        Janus.error("WebRTC error:", error);
                                    }
                                });
                        }
                        if(jsep !== undefined && jsep !== null){
                            Janus.debug("Receive Handling SDP as well...");
                            Janus.debug(jsep);
                            sfutest.handleRemoteJsep({jsep: jsep, success : x =>{
                                console.log("success handle remote");
                            }, 
                            error : e=>{
                                console.error(e);
                            }});
                        }

                    },
                    onlocalstream : (stream)=>{
                        Janus.debug(" ::: Got a local stream :::");
                        Janus.attachMediaStream(document.querySelector(".video"),stream);
                    },
                    onremotestream : (stream)=>{},
                })
            },
            error : x=>{
                //Janus.error(x);
                console.error(x);
            },
            destroyed : x=>{
                console.log("destroyed");
            }
        })    
    }})
    //add events
    document.querySelector(".start-btn").addEventListener("click", ()=>[
        sfutest.send({message:{request:"join", room: roomId, ptype:"publisher", id: parseInt(Math.random()*1000000, 10)}})
    ]);
    
}
init();