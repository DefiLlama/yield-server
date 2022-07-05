const utils = require('../utils');
const Web3 = require('web3');

const apy = async () => {
  // Fetch APY
  const apyData = await utils.getData(
    'https://api.capsa.finance/stats/projected-apy'
  );
  const tvlData = await utils.getData(
    'https://api.capsa.finance/stats/allocation'
  );

  const capsa = {
    pool: 'CAPSA',
    chain: utils.formatChain('polygon'),
    project: 'capsa',
    symbol: utils.formatSymbol('CAPSA'),
    tvlUsd: tvlData.allocation.total,
    apy: apyData["projected_apy"],
  };

  return [capsa];
};

module.exports = {
  timetravel: false,
  apy,
};
