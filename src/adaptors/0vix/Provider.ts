const ethers = require("ethers");


// initialize the provider -- can be hot-swapped with any other RPC Provider with instant flow-down through all functions
const PROVIDER = new ethers.providers.JsonRpcProvider(
    process.env.ALCHEMY_CONNECTION_POLYGON
);

module.exports = { PROVIDER };
