const utils = require('../utils');

const apr = async () => {
  const apyData = await utils.getData(
    'http://hedge.so/api/yield?mode=defillama'
  );

  const pools = [];
  for (const pool of apyData) {
    const name = pool.symbol.split(' ');
    pools.push({
      pool: pool.pool,
      chain: utils.formatChain('solana'),
      project: 'hedge',
      symbol: name[0],
      poolMeta: name
        .slice(1)
        .join(' ')
        .replace(/[\])}[{(]/g, ''),
      tvlUsd: Number(pool.tvl),
      apyBase: Number(pool.apyBase),
      apyReward: Number(pool.apyReward),
      rewardTokens: pool.rewardTokens,
      underlyingTokens: pool.underlyingTokens,
    });
  }
  return pools;
};

module.exports = {
  timetravel: false,
  apy: apr,
  url: 'https://www.hedge.so/pools',
};
