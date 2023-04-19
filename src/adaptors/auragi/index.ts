const utils = require('../utils');

const API_URL: string = 'https://api.auragi.finance/api/v1/pairs';

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

const getApy = async () => {
  const { data: poolsRes }: Response = await utils.getData(API_URL);

  const pools = poolsRes.map((pool) => {
    return {
      pool: pool.address,
      chain: utils.formatChain('arbitrum'),
      project: 'auragi',
      symbol: `${pool.token0.symbol}-${pool.token1.symbol}`,
      tvlUsd: pool.tvl,
      apyReward: pool.apr,
      underlyingTokens: [pool.token0.address, pool.token1.address],
      rewardTokens: [
        '0xFF191514A9baba76BfD19e3943a4d37E8ec9a111', // AGI
      ],
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://auragi.finance/pools',
};
