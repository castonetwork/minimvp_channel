const pull = require('pull-stream');
const createNode = require("./create-node");
const streamerMetaInfo = {
  id: '1f8afcv01',
  name: '저스틴또뜨',
  description: 'justin beiver짭퉁 방송입니다.',
  onAir: true,
};

const initApp = () => {
  console.log("init app");

  createNode
    .then(node => {
      console.log("node created");
      console.log("node is ready", node.peerInfo.id.toB58String());
      node.handle('/streamer', (protocol, conn) => {

        console.log('send streamer information');
        pull(
          pull.values([JSON.stringify(streamerMetaInfo)]),
          conn,
          pull.map(o=>o.toString()),
          pull.concat((err, res)=> console.log(res)),
        );
      });
      node.on("peer:connect", peerInfo => {
        console.log('connected', peerInfo.id.toB58String())
      });
      node.start(err => {
        if (err) {
          console.error(err);
          return;
        }
        console.log(node.peerInfo.multiaddrs.toArray().map(o => o.toString()));
      })
    });
};
initApp();
