const utils = require('../utils');
const sdk = require("@defillama/sdk");
// https://api.telos.net/v1/apy/evm

const sTlosAPYfunction = async () => {
  
  // Get sTLOS APY using Telos API
  const apyPercentage = await utils.getData(
    'https://api.telos.net/v1/apy/evm'
  );

  return apyPercentage; // sTLOS only has a single pool with APY
;}

module.exports = {
  timetravel: false,
  apy: sTlosAPYfunction,
  url: 'https://api.telos.net/v1/apy/evm',
};