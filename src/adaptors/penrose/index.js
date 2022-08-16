const utils = require('../utils');

const collectPools = async () => {
  const data = await utils.getData('https://api.penrose.money/pools');

  return data.map((pool) => ({
    pool: pool.id,
    chain: utils.formatChain('polygon'),
    project: 'penrose',
    symbol: pool.poolData.symbol.replace('-', ' ').replace('/', '-'),
    tvlUsd: Number(pool.totalTvlUsd),
    apy: utils.aprToApy(Number(pool.totalApr)),
  }));
};

module.exports = {
  timetravel: false,
  apy: collectPools,
};
