const utils = require('../utils');

const API_URL: string = 'http://api.maiadao.io/apr';

const getApy = async () => {
  const res = await utils.getData(API_URL);

  const pools = res.map((pool) => {
    return {
      pool: pool.poolAddress,
      chain: utils.formatChain('metis'),
      project: 'hermes-protocol',
      symbol: `${pool.token0.symbol}-${pool.token1.symbol}`,
      tvlUsd: pool.tvlUsd,
      apyReward: pool.apr,
      underlyingTokens: [pool.token0.address, pool.token1.address],
      rewardTokens: pool.rewardAddresses,
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
