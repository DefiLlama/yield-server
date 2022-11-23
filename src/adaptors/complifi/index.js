const utils = require('../utils');
const axios = require('axios');

const collectPools = async () => {
  const apyData = (
    await axios.get('https://back.compli.fi/api/v2/statistics/apy?network=137')
  ).data;
  const tvlData = (await axios.get('https://back.compli.fi/api/protocol/tvl'))
    .data;

  return Object.entries(apyData).map(([poolAddress, apy], i) => ({
    pool: poolAddress,
    chain: utils.formatChain('polygon'),
    project: 'complifi',
    symbol: utils.formatSymbol(
      tvlData['tvlPools']['137'][poolAddress]['collateral']
    ),
    tvlUsd: tvlData['tvlPools']['137'][poolAddress]['tvl'],
    apy: apy * 100,
  }));
};

module.exports = {
  timetravel: false,
  apy: collectPools,
  url: 'https://v2.compli.fi/invest',
};
