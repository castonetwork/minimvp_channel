"use strict";

const TCP = require("libp2p-tcp");
const MulticastDNS = require("libp2p-mdns");
const WS = require("libp2p-websockets");
const WebSocketStar = require("libp2p-websocket-star");
const Bootstrap = require("libp2p-bootstrap");
const KadDHT = require("libp2p-kad-dht");
const Multiplex = require("libp2p-mplex");
const SECIO = require("libp2p-secio");
const libp2p = require("libp2p");

const bootstrapers = [
  "/dns4/ams-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLer265NRgSp2LA3dPaeykiS1J6DifTC88f5uVQKNAd",
  "/dns4/sfo-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLju6m7xTh3DuokvT3886QRYqxAzb1kShaanJgW36yx",
  "/dns4/lon-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLMeWqB7YGVLJN3pNLQpmmEk35v6wYtsMGLzSr5QBU3",
  "/dns4/sfo-2.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLnSGccFuZQJzRadHn95W2CrSFmZuTdDWP8HXaHca9z",
  "/dns4/sfo-3.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLPppuBtQSGwKDZT2M73ULpjvfd3aZ6ha4oFGL1KrGM",
  "/dns4/sgp-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLSafTMBsPKadTEgaXctDQVcqN88CNLHXMkTNwMKPnu",
  "/dns4/nyc-1.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLueR4xBeUbY9WZ9xGUUxunbKWcrNFTDAadQJmocnWm",
  "/dns4/nyc-2.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmSoLV4Bbm51jM9C4gDYZQ9Cy3U6aXMJDAbzgu2fzaDs64",
  "/dns4/wss0.bootstrap.libp2p.io/tcp/443/wss/ipfs/QmZMxNdpMkewiVZLMRxaNxUeZpDUb34pWjZ1kZvsd16Zic",
  "/dns4/wss1.bootstrap.libp2p.io/tcp/443/wss/ipfs/Qmbut9Ywz9YEDrz8ySBSgWyJk41Uvm2QJPhwDJzJyGFsD6"
];

class Node extends libp2p {
  constructor(_options) {
    const wsstar = new WebSocketStar({ id: _options.peerInfo.id });

    const defaults = {
      modules: {
        transport: [TCP, WS, wsstar],
        streamMuxer: [Multiplex],
        connEncryption: [SECIO],
        peerDiscovery: [MulticastDNS, Bootstrap, wsstar.discovery],
        dht: KadDHT
      },
      config: {
        peerDiscovery: {
          mdns: {
            enabled: true
          },
          bootstrap: {
            interval: 10000,
            enabled: true,
            list: bootstrapers
          },
          websocketStar: {
            enabled: true
          }
        },
        dht: {
          kBucketSize: 20
        },
        EXPERIMENTAL: {
          dht: false,
          pubsub: false
        }
      }
    };

    super({ ...defaults, ..._options });
  }
}

module.exports = Node;
