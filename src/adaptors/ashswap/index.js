const { request } = require('graphql-request');
const axios = require('axios');
const { removeDuplicates } = require('../utils');

const API_URL = 'https://api-v2.ashswap.io/graphql';
const MULTIVERSX_API = 'https://api.multiversx.com';

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

// The API's precomputed defillama.pools.tvlUsd has been null since mid-2026,
// so pool TVL is rebuilt from raw reserves and live token prices instead.
const PoolStateQuery = `
{
  pools { address tokens { id price } reserves }
  poolsV2 { address tokens { id price } reserves }
}
`;

const getPoolTvls = async () => {
  const { pools, poolsV2 } = await request(API_URL, PoolStateQuery);
  const allPools = [...pools, ...poolsV2];
  const tokenIds = [
    ...new Set(allPools.flatMap((p) => p.tokens.map((t) => t.id))),
  ];
  const tokenInfo = (
    await axios.get(`${MULTIVERSX_API}/tokens`, {
      params: {
        identifiers: tokenIds.join(','),
        fields: 'identifier,decimals',
        size: tokenIds.length,
      },
    })
  ).data;
  const decimalsById = Object.fromEntries(
    tokenInfo.map((t) => [t.identifier, t.decimals])
  );
  return Object.fromEntries(
    allPools.map((p) => [
      p.address,
      p.tokens.reduce((sum, token, i) => {
        const decimals = decimalsById[token.id];
        if (decimals == null || !token.price) return sum;
        return sum + (Number(p.reserves[i]) / 10 ** decimals) * token.price;
      }, 0),
    ])
  );
};

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
  const tvlByAddress = await getPoolTvls().catch((err) => {
    console.log(`ashswap tvl rebuild failed: ${err.message}`);
    return {};
  });

  for (const pool of results.defillama.pools) {
    pools.push({
      pool: pool.address,
      project: 'ashswap',
      chain: 'MultiversX',
      symbol: getSymbol(pool.tokens),
      tvlUsd: pool.tvlUsd ?? tvlByAddress[pool.address] ?? null,
      apyBase: pool.apyBase,
      apyReward: pool.apyReward,
      rewardTokens: ['ASH-a642d1'],
      underlyingTokens: getTokens(pool.tokens),
    });
  }

  return removeDuplicates(pools);
};

module.exports = {
  protocolId: '2551',
  apy,
  timetravel: false,
  url: 'https://app.ashswap.io/pool/',
};
