
const Node = require('./node-bundle');
const PeerInfo = require('peer-info');

const createNode = ()=> new Promise((resolve, reject) => {
  PeerInfo.create((err, peerInfo) => {
    peerInfo.multiaddrs.add('/ip4/0.0.0.0/tcp/0');
    const node = new Node({peerInfo});
    node.start(err => err && reject(err) || resolve(node))
  });
});

module.exports = createNode;