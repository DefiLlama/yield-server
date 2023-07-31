var ethers = require('ethers');
// initialize the provider -- can be hot-swapped with any other RPC Provider with instant flow-down through all functions
var PROVIDER = new ethers.providers.JsonRpcProvider('https://polygon-rpc.com');
module.exports = { PROVIDER: PROVIDER };
