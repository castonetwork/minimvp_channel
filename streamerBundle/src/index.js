const Janus = require('./janus.es.js').default;
var roomId = parseInt(document.querySelector(".roomId").value, 10);
var sfutest = null;
var opaqueId = "videoroomtest-"+Janus.randomString(12);

let init = ()=>{
    Janus.init({debug :"all", callback : function(){
        console.log("start");
        let janus = new Janus({
            server : "ws://54.180.93.237:8188/",
            success : x=>{
                console.log("success");
                janus.attach({
                    plugin : "janus.plugin.videoroom",
                    opaqueId : opaqueId,
                    success : (pluginHandle)=>{
                        sfutest = pluginHandle;
                        Janus.log("Plugin attached! (" + sfutest.getPlugin() + ", id=" + sfutest.getId() + ")");
                        
                        sfutest.send({message:{request:"create", 
                            room: roomId, 
                            videocodec : "H264",
                            audiocodec : "opus",
                            notify_joining : true
                        }});
                        //sfutest.send({message:{request:"join", room: roomId, ptype:"publisher", id: parseInt(Math.random()*1000000, 10)}});
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
                        //console.log(jsep);
                        if(msg["videoroom"] === "joined"){
                            sfutest.createOffer(
                                {
                                    // Add data:true here if you want to publish datachannels as well
                                    media: { audioRecv: false, videoRecv: false, audioSend: true, videoSend: true },	// Publishers are sendonly
                                    // If you want to test simulcasting (Chrome and Firefox only), then
                                    // pass a ?simulcast=true when opening this demo page: it will turn
                                    // the following 'simulcast' property to pass to janus.js to true
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
                                        /*sfutest.send({"message": {
                                            request : "publish",
                                            audio : false,
                                            data : false,

                                        }, "jsep": jsep});*/
                                    },
                                    error: function(error) {
                                        Janus.error("WebRTC error:", error);
                                    }
                                });
                            Janus.debug(" ::: Got a joined (publisher) :::");
                            console.log(msg);
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
}
let letjoin = () =>{
    sfutest.send({message:{request:"join", room: roomId, ptype:"publisher", id: parseInt(Math.random()*1000000, 10)}});
}
document.querySelector(".start-btn").addEventListener("click", letjoin);

let joinInit = ()=>{
    var roomId = parseInt(document.querySelector(".roomId").value, 10);
    console.log("init start");
        let janus = new Janus({
            server : "ws://54.180.93.237:8188/",
            success : x=>{
                console.log("success");
                janus.attach({
                    plugin : "janus.plugin.videoroom",
                    opaqueId : opaqueId,
                    success : (pluginHandle)=>{
                        sfutest = pluginHandle;
                        Janus.log("Plugin attached! (" + sfutest.getPlugin() + ", id=" + sfutest.getId() + ")");
                        sfutest.send({message:{request:"listparticipants", room : roomId}, success : msg =>{
                            console.log("participants")
                            console.log(msg);
                            if( msg.participants[0] !== undefined
                                && msg.participants[0] !== null){
                                    sfutest.videoCodec = "H264"
                                    sfutest.send({message:{ 
                                        "request" : "join", 
                                        "room"  : roomId, 
                                        "ptype" : "subscriber", 
                                        "feed"  : msg.participants[0].id,  
                                        "private_id" : parseInt(Math.random()*1000000, 10) }});
                            }
                        }}
                        
                        );
                        console.log(sfutest.send)
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
                        Janus.debug(" ::: Got a message (sub) :::");
                        console.log(msg);
                        console.log(jsep);
                        
                        if(msg["videoroom"] === "attached"){
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
                                        media: { audioRecv: true, 
                                            videoRecv: true, audioSend: false, videoSend: false },	// We want recvonly audio/video
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
                    },
                })
            },
            error : x=>{
                console.error(x);
            },
            destroyed : x=>{
                console.log("destroyed");
            }
        })    
    
}
document.querySelector(".join-btn").addEventListener("click", joinInit);
init();