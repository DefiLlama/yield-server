const utils = require('../utils');

const POOLS_URL = 'https://api-v3.bancor.network/pools';

const apy = async () => {
  const { data } = await utils.getData(POOLS_URL);

  const pools = data.map((pool) => {
    const apy =
      (((Number(pool.fees7d.usd) / 10) * 52) / Number(pool.stakedBalance.usd)) *
      100;
    return {
      pool: `bancor-${pool.poolDltId}`,
      project: 'bancor-v3',
      chain: utils.formatChain('ethereum'),
      symbol: pool.name,
      tvlUsd: Number(pool.stakedBalance.usd),
      apyBase: Number.isFinite(apy) ? apy : 0,

      underlyingTokens: [pool.poolDltId],
    };
  });
  return pools;
};

module.exports = {
  apy,
  url: 'https://app.bancor.network/earn',
  timetravel: false,
};
