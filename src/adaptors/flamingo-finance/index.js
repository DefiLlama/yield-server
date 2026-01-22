const utils = require('../utils');

const poolsFunction = async () => {
  const poolsData = await utils.getData(
    'https://flamingo-us-1.b-cdn.net/flamingo/analytics/flamingo/defillama-yields'
  );

  const pools = Array.isArray(poolsData) ? poolsData : poolsData.pools;

  return pools.reduce((acc, p) => {
    if (!acc.some((pool) => pool.pool === p.pool)) {
      acc.push({
        pool: p.pool,
        chain: 'Neo',
        project: 'flamingo-finance',
        symbol: p.symbol,
        tvlUsd: p.tvlUsd,
        apyBase: p.apyBase || 0,
        apyReward: p.apyReward || 0,
        rewardTokens: p.rewardTokens
          ? Array.isArray(p.rewardTokens)
            ? p.rewardTokens
            : [p.rewardTokens]
          : [],
        underlyingTokens: p.underlyingTokens || [],
        poolMeta: p.poolMeta || null,
      });
    }
    return acc;
  }, []);
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://flamingo.finance/earn/overview',
};