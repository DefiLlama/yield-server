const ethers = require('ethers');

// initialize the provider -- can be hot-swapped with any other RPC Provider with instant flow-down through all functions
const PROVIDERS = {
  polygon: new ethers.providers.JsonRpcProvider('https://polygon-rpc.com'),
  polygon_zkevm: new ethers.providers.JsonRpcProvider('https://zkevm-rpc.com'),
  manta: new ethers.providers.JsonRpcProvider('https://1rpc.io/manta'),
  astrzk: new ethers.providers.JsonRpcProvider('https://rpc.astar-zkevm.gelato.digital'),
}

module.exports = { PROVIDERS };
