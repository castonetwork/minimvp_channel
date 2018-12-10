const pull = require('pull-stream')
const stringify = require('pull-stringify')
const Pushable = require('pull-pushable')
const {tap} = require('pull-tap')
const Many = require('pull-many')
const Websocket = require('ws')
const wsSource = require('pull-ws/source')
const wsSink = require('pull-ws')
const {sendStream, recvNotify, broadcastToChannel} = require('./pushnNotify')
const {keepAlive, createSession, attach, createRoom, joinRoom, configure, addIceCandidate, subscribe, start} = require(
  './socketStream')
const crypto = require('crypto')

const socketSingleTon = (() => {
  let socket
  let intervalIds = [];
  return {
    getSocket: (wsUrl, protocol) => {
      if (!socket) {
        socket = new Websocket(wsUrl, protocol)
        socket.on('close', () => intervalIds.map(clearInterval));
      }
      return socket
    },
    getIntervalIds : () => intervalIds
  }
})()

const setupJanusWebSocket = async ({wsUrl, protocol = 'janus-protocol'}) =>
  new Promise(async (resolve, reject) => {
    const socket = socketSingleTon.getSocket(wsUrl, protocol)
    pull(
      sendStream,
      pull.map(JSON.stringify),
      tap(o => console.log('[SENT]', o)),
      wsSink(socket),
    )
    pull(
      wsSource(socket),
      pull.map(o => JSON.parse(o)),
      pull.drain(o => {
        recvNotify(o)
      }),
    )
    
    /* mediaServer initialize Sequence */
    const sessionId = await createSession()
    resolve({
      sessionId
    })
  })

const getEndpoint = async ({sessionId}) =>{
  const intervalIds = socketSingleTon.getIntervalIds();
  const handleId = await attach(sessionId)
  /* generate keepalive */
  const timerHandler = setInterval(() => keepAlive({sessionId, handleId}),
    30000)
  intervalIds.push(timerHandler);
  return {
    sessionId,
    handleId
    // timerHandler
  }
}
const getRoomInput = async (endpoint)=>{
  const { sessionId, handleId } = endpoint;
  const roomId = await createRoom({sessionId, handleId})
  console.log(`[CONTROLLER] roomId: ${roomId}`)
  const joinedRoomInfo = await joinRoom({sessionId,handleId,roomId})
  console.log('[CONTROLLER] joining room')
  //peers[idStr].roomInfo.publisherId = joinedRoomInfo.plugindata.data.id
  const publisherId = joinedRoomInfo.plugindata.data.id
  return {
    ...endpoint,
    roomId,
    publisherId
  }
}

const getRoomOutput = async (roomInput)=>{
  const { sessionId, handleId, roomId, publisherId} = roomInput;
  const roomOutput = await subscribe({sessionId,handleId,roomId,publisherId})
  console.log('[CONTROLLER] joining room')
  return {
    sessionId,
    handleId,
    timerHandler,
    roomId,
    publisherId
  }
}
/* setup Node */
const setupNode = async ({node, wsUrl}) => {
  let session = await setupJanusWebSocket({wsUrl})
  let peers = {}
  node.handle('/controller', (protocol, conn) => {
    const sendToChannel = Pushable()
    pull(broadcastToChannel.listen(), pull.log());
    pull(
      Many([sendToChannel, broadcastToChannel.listen()]),
      stringify(),
      conn,
      pull.map(o => JSON.parse(o.toString())),
      tap(console.log),
      pull.drain(event => {
        const events = {
          'requestPeerInfo': o => {
            sendToChannel.push({
              type: 'sendChannelList',
              peers,
            })
          },
        }
        events[event.type] && events[event.type](event)
      }),
    );
  })
  node.on('peer:discovery', peerInfo => {
    const idStr = peerInfo.id.toB58String()
    if (!peers[idStr]) {
      peers[idStr] = {
        isDiscovered: true,
      }
    }
    !peers[idStr].isDialed &&
    node.dialProtocol(peerInfo, '/streamer', async (err, conn) => {
      if (err) {
        // console.error("Failed to dial:", err);
        return
      }
      peers[idStr].isDialed = true
      console.log(`[STREAMER] ${idStr} is dialed`)
      let pushStreamer = Pushable()
      // setup a janus WebSocket interface
      const endpoint = await getEndpoint(session)
      const roomInfo = await getRoomInput(endpoint);
      peers[idStr] = {
        ...peers[idStr],
        roomInfo,
        hash: crypto.createHash('md5').update(idStr).digest('hex'),
      }
      // request creator information
      pushStreamer.push({
        type: 'requestStreamerInfo',
        peerId: idStr,
      })
      pull(
        pushStreamer,
        stringify(),
        tap(o => console.log('[CONTROLLER]', o)),
        conn,
        pull.map(o => JSON.parse(o.toString())),
        tap(o => console.log('[STREAMER]', o)),
        pull.map(o => ({...o, ...roomInfo})),
        pull.drain(event => {
          const events = {
            'sendCreateOffer': async ({jsep}) => {
              const answerSDP = await configure({...roomInfo, jsep})
              console.log('[MEDIASERVER] configured:', answerSDP)
              pushStreamer.push({
                type: 'answer',
                sdp: answerSDP.sdp,
              })
            },
            'sendTrickleCandidate': async ({candidate}) => {
              console.log('[CONTROLLER] addIceCandidate')
              await addIceCandidate({
                candidate,
                ...roomInfo,
              })
            },
            'updateStreamerInfo': ({profile, title=""}) => {
              console.log(`[CONTROLLER] updateStreamerInfo from ${idStr}`);
              peers[idStr] = {...peers[idStr], profile, title};
              broadcastToChannel({
                type: "updateChannelInfo",
                peerId: idStr,
                info: peers[idStr]
              });
            },
          }
          events[event.request] && events[event.request](event)
          // sendJanusStream.push
        }),
      )
    })
  })
  node.on('peer:connect', peerInfo => {
    console.log('[CONTROLLER] peer connected:', peerInfo.id.toB58String())
  })
  node.on('peer:disconnect', peerInfo => {
    console.log('[CONTROLLER] peer disconnected:', peerInfo.id.toB58String())
    const idStr = peerInfo.id.toB58String()
    idStr && peers[idStr] && delete peers[idStr]
  })
  node.start(err => {
    if (err) {
      console.error(err)
      return
    }
    console.log('>> ',
      node.peerInfo.multiaddrs.toArray().map(o => o.toString()))
  })
}

module.exports = setupNode