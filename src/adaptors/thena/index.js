const utils = require('../utils');

const API_URL = 'https://api.thena.fi/api/v1/pools';

const getApy = async () => {
  const { data: poolsRes } = await utils.getData(API_URL);

  const pools = poolsRes.map((pool) => {
    return {
      pool: pool.address,
      chain: utils.formatChain('bsc'),
      project: 'thena',
      symbol: `${pool.token0.symbol}-${pool.token1.symbol}`,
      tvlUsd: pool.tvl,
      apyReward: pool.gauge.apr,
      underlyingTokens: [pool.token0.address, pool.token1.address],
      rewardTokens: [
        '0xF4C8E32EaDEC4BFe97E0F595AdD0f4450a863a11', // THE
      ],
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://thena.fi/liquidity',
};
