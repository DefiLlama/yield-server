const utils = require('../utils');

const API_URL: string = 'https://api.velodrome.finance/api/v1/pairs';

const project = 'velodrome-v1';

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
      chain: utils.formatChain('optimism'),
      project,
      symbol: `${pool.token0.symbol}-${pool.token1.symbol}`,
      tvlUsd: pool.tvl,
      apyReward: pool.apr,
      underlyingTokens: [pool.token0.address, pool.token1.address],
      rewardTokens: [
        '0x3c8B650257cFb5f272f799F5e2b4e65093a11a05', // velo
      ],
      url: 'https://app.velodrome.finance/liquidity',
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy,
};
