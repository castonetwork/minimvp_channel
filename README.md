# Prerequisites
* node.js(10.x+)
* docker

# How to start
## build all
(from root directory)
```
cd streamer
npm install
cd ../controller
npm install
cd ../channels
npm install
cd ../mediaServer
npm run build
```
## start servers
### mediaServer
```
cd mediaServer
npm start
```
### controller
```
cd controller
npm start
```
### streamer(webServer)
```
cd streamer
npm start
```
### channels(webServer)
```
cd channels
npm start
```
# Workflow sequence diagrams
## Initialize
```mermaid
sequenceDiagram
  participant st as streamer
  participant ct as controller
  participant ms as mediaServer
  participant ch as channel
  ct->>st: discovery
  ct->>st: dialProtocol
  st->>ct: handle
  ct->>ms: createSession
  ms->>ct: sessionId
  ct->>ms: attach
  ms->>ct: handleId
  loop every30Second
  ct->>ms: setKeepAlive
  ms->>ct: ack
  end
  ct->>ms:createRoom
  ms->>ct:roomId
  ct->>ms:join room 
  
```
## Streamer Connect
```mermaid
sequenceDiagram
  participant st as streamer
  participant ct as controller
  participant ms as mediaServer
  participant ch as channel
  st->>st: ready Event
  st->>st: new RTCPeerConnection
  st->>st: getUserMedia
  st->>st: pc.createOffer
  st->>st: pc.setLocalDescription
  st->>ct: sendCreateOffer
  ct->>ms: configure
  ms->>ct: answerOffer(SDP)
  ct->>st: answerOffer(SDP)
  st->>st: setRemoteDescription(SDP)
  st->>st: onicecandidate
  st->>ct: sendTrickleCandidate
  ct->>ms: addIceCandidate(candidiate)
  ms-->st: ICE executed
  st->>ms: stream Start
```
## Channel Connection
```mermaid
sequenceDiagram
  participant st as streamer
  participant ct as controller
  participant ms as mediaServer
  participant ch as channel
  ch->>ct: discovery
  ch->>ct: dialProtocol
  ct->>ch: handle
  ct->>ms: createSession
  ms->>ct: sessionId
  ct->>ms: attach
  ms->>ct: handleId
  loop every30Second
  ct->>ms: setKeepAlive
  ms->>ct: ack
  end
  ch->>ct: requestOfferSDP
  ct->>ms: getRoomList
  ms->>ct: roomList
  ct->>ms: getRoomDetail
  ms->>ct: roomDetail
  ct->>ms: join as subscriber
  ms->>ct: offerSDP
  ct->>ch: offerSDP
  ch->>ch: new RTCPeerConnection
  ch->>ch: pc.setRemoteDescription
  ch->>ch: pc.createAnswer
  ch->>ch: pc.setLocalDescription
  ch->>ct: sendCreateAnswer
  ct->>ms: start with answerSDP
  ch->>ch: onicecandidate
  ch->>ct: sendTrickleCandidate
  ct->>ms: addIceCandidate(candidiate)
  ms-->ch: ICE executed
  ms->>ch: stream Start
```

