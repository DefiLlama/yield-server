const utils = require('../utils');

const apy = async () => {
  const apyData = await utils.getData(
    'https://api.capsa.finance/stats/projected-apy'
  );
  const tvlData = await utils.getData(
    'https://api.capsa.finance/stats/allocation'
  );

  const scaledApy = apyData['last_week_performance'] * 52;

  const capsa = {
    pool: 'CAPSA',
    chain: utils.formatChain('polygon'),
    project: 'capsa',
    symbol: utils.formatSymbol('CAPSA'),
    tvlUsd: tvlData.allocation.total,
    apy: scaledApy,
  };

  return [capsa];
};

module.exports = {
  timetravel: false,
  apy,
};
