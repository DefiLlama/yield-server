const utils = require('../utils');

const collectPools = async () => {
  const [apyData, tvlData] = await Promise.all([
    utils.getData('https://eth.complifi.me/api/v2/statistics/apy?network=137'),
    utils.getData('https://eth.complifi.me/api/protocol/tvl')
  ]);

  return Object.entries(apyData).map(([poolAddress, apy], i) => ({
      pool: poolAddress,
      chain: utils.formatChain('polygon'),
      project: 'complifi',
      symbol: utils.formatSymbol(tvlData['tvlPools']['137'][poolAddress]['collateral']),
      tvlUsd: tvlData['tvlPools']['137'][poolAddress]['tvl'],
      apy: apy * 100,
    })
  );
};

module.exports = {
  timetravel: false,
  apy: collectPools,
};
