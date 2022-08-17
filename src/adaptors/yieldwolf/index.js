const utils = require('../utils');
const { request, gql } = require('graphql-request');
const graphs_url = 'https://yw-api-2-55s94.ondigitalocean.app/graphql';

const query = gql`
  query Pools($chainId: Int, $first: Int, $filter: PoolFilter, $afterCursor: String, $poolSortBy: PoolSortFilter, $querySearch: String) {\n  pools(\n    chainId: $chainId\n    first: $first\n    filter: $filter\n    afterCursor: $afterCursor\n    poolSortBy: $poolSortBy\n    querySearch: $querySearch\n  ) {\n    nodes {\n      ...PoolFragment\n      __typename\n    }\n    cursor\n    hasNextPage\n    totalCount\n    __typename\n  }\n}\n\nfragment PoolFragment on Pool {\n  type\n  chainId\n  address\n  pid\n  baseStakingAddresses\n  masterChefAddress\n  masterChefPid\n  stakingAddress\n  liquidityRouterAddress\n  swapRouterAddress\n  tvl\n  totalStakeTokens\n  totalEarnTokens\n  state\n  apy\n  dailyReturn\n  poolApr\n  depositFeeBP\n  withdrawFeeBP\n  bondPrice\n  name\n  createdAt\n  farm {\n    ...FarmFragment\n    __typename\n  }\n  stakeToken {\n    ...TokenFragment\n    __typename\n  }\n  earnToken {\n    ...TokenFragment\n    __typename\n  }\n  token0 {\n    ...TokenFragment\n    __typename\n  }\n  token1 {\n    ...TokenFragment\n    __typename\n  }\n  extraEarnTokens {\n    ...TokenFragment\n    __typename\n  }\n  __typename\n}\n\nfragment TokenFragment on Token {\n  address\n  decimals\n  symbol\n  name\n  amountPerUsd\n  lpApy\n  lpApr\n  isStablecoin\n  circulatingSupply\n  factoryAddress\n  __typename\n}\n\nfragment FarmFragment on Farm {\n  chainId\n  stakingType\n  key\n  name\n  farmType\n  stakingType\n  listed\n  reviewed\n  createdAt\n  startTime\n  masterChefSettings {\n    pendingKey\n    __typename\n  }\n  routers\n  __typename\n}\n
`;

const networkMapping = {
  10: {
    name: 'optimism',
  },
  43114: {
    name: 'avalanche',
  },
  1666600000: {
    name: 'harmony',
  },
  42220: {
    name: 'celo',
  },
  42161: {
    name: 'arbitrum',
  },
  250: {
    name: 'fantom',
  },
  137: {
    name: 'polygon',
  },
  56: {
    name: 'binance',
  },
  25: {
    name: 'cronos',
  },
};

const apy = async () => {
  const poolsResult = await Promise.all(Object.keys(networkMapping).map(id => {
    const value = {chainId: Number(id), first: 100, filter: {state: {eq: 'listed'}}};
    return request(graphs_url, query, value);
  }));
  const res = Object.keys(networkMapping).map((chainId, index) => {
    const { pools } = poolsResult[index];
    return pools.nodes
      .filter(e => e.token0 !== null)
      .filter(e => e.tvl !== 0).map(pool => {
        const {token0, token1, tvl, apy, address, poolApr, stakeToken, earnToken} = pool;
        const { lpApy } = stakeToken;
        const apyBase = lpApy;
        const apyReward = poolApr;
        return {
          pool: address + '-' + networkMapping[chainId].name,
          chain: utils.formatChain(networkMapping[chainId].name),
          project: 'yieldwolf',
          symbol: `${token0?.symbol}${token1?.symbol ? '-' + token1?.symbol : ''}`,
          tvlUsd: tvl,
          apyBase,
          apyReward,
          rewardTokens: [earnToken?.address],
          underlyingTokens: [token0?.address, token1?.address].filter(e => e)
        }
    });
  });
  return res.flat();
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://yieldwolf.finance/',
};
