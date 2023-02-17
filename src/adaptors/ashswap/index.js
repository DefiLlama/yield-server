const { request } = require('graphql-request');

const API_URL = 'https://api-v2.ashswap.io/graphql';

const YieldQuery = `
{
  defillama {
    pools {
      address
      tokens
      tvlUsd
      apyBase
      apyReward
    }
  }
}
`

const getSymbol = (tokens) => {
  let result = '';
  for (const token in tokens) {
    if (token != null) {
      result += token.split('-')[0] + '-';
    }
  }
  return result.slice(0, -1);
};

const apy = async () => {
  const pools = [];
  let results = await request(API_URL, YieldQuery);

  for (const pool in results.defillama) {
    pools.push({
      pool: pool.address,
      project: 'ashswap',
      chain: 'MultiversX',
      symbol: getSymbol(pool.tokens),
      tvlUsd: pool.tvlUsd,
      apyBase: pool.apyBase,
      apyReward: pool.apyReward,
      rewardTokens: 'ASH-a642d1',
      underlyingTokens: pool.tokens
    })
  }

  return pools;
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.ashswap.io/pool/',
};
