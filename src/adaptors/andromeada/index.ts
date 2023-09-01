const utils = require('../utils');

const API_URL: string = 'https://api.andromeada.com/api/v1/pairs';

const project = 'andromeada';

interface Pool {
  address: string;
  token0: { address: string; symbol: string };
  token1: Pool['token0'];
  tvl: number;
  apr: number;
}

interface Response {
  data: Array<Pool>;
}

const apy = async () => {
  const { data: poolsRes }: Response = await utils.getData(API_URL);

  const pools = poolsRes.map((pool) => {
    return {
      pool: pool.address,
      chain: utils.formatChain('base'),
      project,
      symbol: `${pool.token0.symbol}-${pool.token1.symbol}`,
      tvlUsd: pool.tvl,
      apyReward: pool.apr,
      underlyingTokens: [pool.token0.address, pool.token1.address],
      rewardTokens: [
        '0xFA7D088f6B1bbf7b1C8c3aC265Bb797264FD360B', // ANDRE
      ],
      url: 'https://andromeada.com/liquidity',
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
};
