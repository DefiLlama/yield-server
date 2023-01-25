const utils = require('../utils');

const API_URL: string = 'https://api-mainnet.solidly.com/api/v1/pairs';

type PoolToken = {
    address: string
    symbol: string
}

type AprObject = {
    current: string
    projected: string
    lastWeek: string
}

interface Pool {
  address: string
  token0: PoolToken
  token1: PoolToken
  totalTvlUsd: string
  totalLpApr: AprObject
}

interface Response {
  data: Array<Pool>;
}

const getApy = async () => {
  const { data: poolsRes }: Response = await utils.getData(API_URL);

  const pools = poolsRes.map((pool: Pool) => {
    return {
      pool: pool.address,
      chain: utils.formatChain('ethereum'),
      project: 'solidly-v2',
      symbol: `${pool.token0.symbol}-${pool.token1.symbol}`,
      tvlUsd: parseFloat(pool.totalTvlUsd),
      apyReward: parseFloat(pool.totalLpApr.current),
      underlyingTokens: [pool.token0.address, pool.token1.address],
      rewardTokens: [
        '0x777172D858dC1599914a1C4c6c9fC48c99a60990', // solid
      ],
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://solidly.com/liquidity',
};