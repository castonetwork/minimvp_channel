const Node = require('./browser-bundle');
const PeerInfo = require('peer-info');
const multiaddr = require('multiaddr');
const createNode = new Promise((resolve, reject) => {
  PeerInfo.create((err, peerInfo) => {
    if (err) reject(err);
    peerInfo.multiaddrs.add(multiaddr("/dns4/ws-star.discovery.libp2p.io/tcp/443/wss/p2p-websocket-star/"));
    const node = new Node({peerInfo});
    resolve(node);
  });
});

module.exports = createNode;