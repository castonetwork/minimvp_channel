const Janus = require('./janus.es.js').default;
var roomId = parseInt(document.querySelector(".roomId").value, 10);
var sfutest = null;
var opaqueId = "videoroomtest-"+Janus.randomString(12);
const endPoint = "http://13.209.96.83:8088/janus";

let init = ()=>{
    Janus.init({debug :"all", callback : function(){
        console.log("start");
        var roomId = parseInt(document.querySelector(".roomId").value, 10);
        console.log("init start");
            let janus = new Janus({
                server : endPoint,
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
                            if(msg["videoroom"] === "joined"){
                                Janus.debug("Joined!");
                                console.log(msg);                                
                                
                            }else if(msg["videoroom"] === "attached"){
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
    });
}
document.querySelector(".join-btn").addEventListener("click", joinInit);
init();