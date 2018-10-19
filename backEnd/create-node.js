
const Node = require('./node-bundle');
const PeerInfo = require('peer-info');
const multiaddr = require('multiaddr');
const createNode = ()=> new Promise((resolve, reject) => {
  PeerInfo.create((err, peerInfo) => {
    peerInfo.multiaddrs.add('/ip4/0.0.0.0/tcp/0');

    const peerIdStr = peerInfo.id.toB58String()
    const ma = `/dns4/star-signal.cloud.ipfs.team/tcp/443/wss/p2p-webrtc-star/ipfs/${peerIdStr}`
    peerInfo.multiaddrs.add(ma);
    peerInfo.multiaddrs.add(multiaddr("/dns4/ws-star-signal-1.servep2p.com/tcp/443/wss/p2p-websocket-star/"))
    
    //peerInfo.multiaddrs.toArray().forEach(console.log);
    const node = new Node({peerInfo});
    node.start(err => err && reject(err) || resolve(node))
  });
});

module.exports = createNode;