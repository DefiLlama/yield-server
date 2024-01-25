const { request } = require('graphql-request');
const { removeDuplicates } = require('../utils');

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
`;

const getSymbol = (tokens) => {
  let result = '';
  for (const token of tokens) {
    if (token != null) {
      result += token.split('-')[0] + '-';
    }
  }
  return result.slice(0, -1);
};

const getTokens = (tokens) => {
  let result = [];
  for (const token of tokens) {
    if (token != null) {
      result.push(token);
    }
  }
  return result;
};

const apy = async () => {
  const pools = [];
  let results = await request(API_URL, YieldQuery);

  for (const pool of results.defillama.pools) {
    pools.push({
      pool: pool.address,
      project: 'ashswap',
      chain: 'MultiversX',
      symbol: getSymbol(pool.tokens),
      tvlUsd: pool.tvlUsd,
      apyBase: pool.apyBase,
      apyReward: pool.apyReward,
      rewardTokens: ['ASH-a642d1'],
      underlyingTokens: getTokens(pool.tokens),
    });
  }

  return removeDuplicates(pools);
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.ashswap.io/pool/',
};
