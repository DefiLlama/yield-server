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
  const { pairs, tokens }: Response = await utils.getData(API_URL);

  const pools = pairs.map((pool) => {
    const token0 = tokens.find(tk => tk.id === pool.token0)
    const token1 = tokens.find(tk => tk.id === pool.token1)

    return {
      pool: pool.id,
      chain: utils.formatChain('arbitrum'),
      project: 'ramses-exchange',
      symbol: `${token0.symbol}-${token1.symbol}`,
      tvlUsd: pool.tvl,
      apyReward: pool.lpApr,
      underlyingTokens: [pool.token0, pool.token1],
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