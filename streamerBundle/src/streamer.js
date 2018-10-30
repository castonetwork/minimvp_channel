const Janus = require('./janus.es.js').default;
var opaqueId = "videoroomtest-"+Janus.randomString(12);
const endPoint = "http://13.209.96.83:8088/janus";
const roomId = 1;

let init = ()=>{
    
    //setting janus.Js
    (new Promise((resolve, reject)=>{
        Janus.init({debug :"all", callback : ()=>{
            Janus.log("Initiating Janus....");
            resolve();
        }});
    }))
    .then(()=>{
        //Connect to Janus Server....
        //setting janus.Js
        let sfutest = null;
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
                        sfutest.send({
                            message: {
                                request:"create", 
                                room: roomId, 
                                videocodec : "H264",
                                audiocodec : "opus",
                                notify_joining : true
                            },
                            success : (data)=>{
                                displayMessage("You are allocated to Room "+roomId);
                            },
                            error : e =>{
                                Janus.error(e);
                            }
                        });    
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
                        }else if(msg["videoroom"] === "event"){
                            if(msg["unpublished"] !== undefined && msg["unpublished"] !== null) {
                                // One of the publishers has unpublished?
                                var unpublished = msg["unpublished"];
                                Janus.log("Publisher left: " + unpublished);
                                if(unpublished === 'ok') {
                                    // That's us
                                    sfutest.hangup();
                                    sfutest.
                                    return;
                                }
                            }
                        }
                        if(jsep !== undefined && jsep !== null){
                            Janus.debug("Receive Handling SDP as well...");
                            Janus.debug(jsep);
                            sfutest.handleRemoteJsep({
                                jsep: jsep, 
                                success : x =>{
                                    Janus.log(" ::: Success handle remote jesp ::: ");
                                }, 
                                error : e=>{
                                    console.error(e);
                                }
                            });
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
        });
            
        //add events
        //start broadcast
        document.querySelector(".start-btn").addEventListener("click", ()=>{
            sfutest.send({message:{
                request:"join", 
                room: roomId, 
                ptype:"publisher", 
                id: parseInt(Math.random()*1000000, 10)}
            });    
            
        }); 
        //stop broadcast
        document.querySelector(".stop-btn").addEventListener("click", ()=>{
            sfutest.send({"message":
                { "request": "unpublish" }
            });
            sfutest.send({"message":
                { "request": "leave" }
            });
        }); 
    });


}
init();