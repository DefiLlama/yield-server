const utils = require('../utils');

const API_URL: string = 'https://ramses-api-5msw7.ondigitalocean.app/v2/pairs';

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
      project: 'ramses-exchange',
      symbol: `${pool.token0.symbol}-${pool.token1.symbol}`,
      tvlUsd: pool.tvl,
      apyReward: pool.apr,
      underlyingTokens: [pool.token0.address, pool.token1.address],
      rewardTokens: [
        '0xaaa6c1e32c55a7bfa8066a6fae9b42650f262418', // RAM
      ],
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://beta.ramses.exchange/liquidity',
};