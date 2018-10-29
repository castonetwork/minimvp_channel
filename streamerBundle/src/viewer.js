const Janus = require('./janus.es.js').default;
var opaqueId = "videoroomtest-"+Janus.randomString(12);
const endPoint = "http://13.209.96.83:8088/janus";


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
                        Janus.debug(" ::: Got a message (Subscriber) :::");
                        console.log(msg);
                        if(msg["videoroom"] === "attached"){
                            let roomId = parseInt(document.querySelector(".roomId").value,10);
                            console.log("attached");
                            console.log(jsep);
                            if(jsep !== undefined && jsep !== null) {
                                Janus.debug("Handling SDP as well...");
                                Janus.debug(jsep);
                                // Answer and attach
                                sfutest.createAnswer(
                                    {
                                        jsep: jsep,
                                        // Add data:true here if you want to subscribe to datachannels as well
                                        // (obviously only works if the publisher offered them in the first place)
                                        media: { 
                                            audioRecv: true, 
                                            videoRecv: true, 
                                            audioSend: false, 
                                            videoSend: false 
                                        },	// We want recvonly audio/video
                                        success: function(jsep) {
                                            Janus.debug("Got SDP!");
                                            Janus.debug(jsep);
                                            var body = { "request": "start", "room": roomId };
                                            sfutest.send({"message": body, "jsep": jsep});
                                        },
                                        error: function(error) {
                                            Janus.error("WebRTC error:", error);
                                            bootbox.alert("WebRTC error... " + JSON.stringify(error));
                                        }
                                    });
                                }
                        }
                    },
                    onlocalstream : (stream)=>{
                        Janus.debug(" ::: Got a local stream :::");
                        
                    },
                    onremotestream : (stream)=>{
                        Janus.debug(" ::: Got a remote stream :::");
                        Janus.attachMediaStream(document.querySelector(".video"),stream);
                    }
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
        document.querySelector(".join-btn").addEventListener("click", ()=>{
            let roomId = parseInt(document.querySelector(".roomId").value,10);
            sfutest.send({message:{
                request:"listparticipants", room : roomId}, 
                success : msg => {
                    Janus.log("participant msg");
                    Janus.log(msg);
                    if(msg["videoroom"] === "event"){
                        displayMessage(msg)
                    }else if( msg.participants[0] !== undefined
                        && msg.participants[0] !== null){
                            sfutest.videoCodec = "H264"
                            sfutest.send({
                                message : { 
                                    "request" : "join", 
                                    "room"  : roomId, 
                                    "ptype" : "subscriber", 
                                    "feed"  : msg.participants[0].id,  
                                    "private_id" : parseInt(Math.random()*1000000, 10) 
                                }
                            });
                    }
                }
            }); 
            //stop broadcast
            document.querySelector(".leave-btn")
            .addEventListener("click", ()=>{
                sfutest.send({"message":
                    { "request": "unpublish" }
                });
                sfutest.send({"message":
                    { "request": "leave" }
                });
            }); 
        });
    });
}
const displayMessage = (msg)=>{
    document.querySelector(".message").innerText = JSON.stringify(msg);
}


init();