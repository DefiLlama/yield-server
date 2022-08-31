const { gql, default: request } = require('graphql-request');

const utils = require('../utils');

const API_URL =
  'https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-mainnet';

const CHAINS_API = {
  ethereum:
    'https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-mainnet',
  arbitrum:
    'https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-arbitrum-one',
  polygon:
    'https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-matic',
  avalanche:
    'https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-avalanche',
  binance:
    'https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-bsc',
  fantom:
    'https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-fantom',
  cronos:
    'https://cronos-graph.kyberengineering.io/subgraphs/name/kybernetwork/kyberswap-elastic-cronos',
  optimism:
    'https://api.thegraph.com/subgraphs/name/kybernetwork/kyberswap-elastic-optimism',
};

const chains = Object.keys(CHAINS_API);

const query = gql`
  query Query {
    pools(orderBy: totalValueLockedUSD, orderDirection: desc) {
      id
      feesUSD
      token0 {
        symbol
        id
      }
      token1 {
        symbol
        id
      }
      totalValueLockedUSD
      poolDayData(orderBy: date, orderDirection: desc, first: 14) {
        feesUSD
      }
    }
  }
`;

const apy = async () => {
  const data = await Promise.all(
    chains.map(async (chain) => [
      chain,
      await request(CHAINS_API[chain], query),
    ])
  );
  const res = data.map(([chain, { pools }]) => {
    const chainPools = pools.map((pool) => {
      const twoWeeksFees = pool.poolDayData.reduce(
        (acc, { feesUSD }) => acc + Number(feesUSD),
        0
      );
      const yearFees = twoWeeksFees * 26;
      const apyBase = (yearFees / Number(pool.totalValueLockedUSD)) * 100;
      return {
        pool: pool.id,
        project: 'kyberswap',
        chain: utils.formatChain(chain),
        symbol: `${pool.token0.symbol}-${pool.token1.symbol}`,
        tvlUsd: Number(pool.totalValueLockedUSD),
        apyBase,
        underlyingTokens: [pool.token0.id, pool.token1.id],
      };
    });
    return chainPools;
  });

  return res.flat().filter((pool) => pool.tvlUsd && pool.apyBase);
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://kyberswap.com/pools',
};
