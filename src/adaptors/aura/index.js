const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { request, gql } = require('graphql-request');
const _ = require('lodash');
const ethers = require('ethers');

const AURA_SUBGRAPH_ENDPOINT = `https://data.aura.finance/graphql`;
const AURA_POOLS_QUERY = gql`
  query {
    pools {
      ...PoolAll
      __typename
    }
  }

  fragment PoolAll on PoolSchema {
    id
    address
    addedAt
    chainId
    balancerPoolId
    balancerPool {
      totalLiquidity
      factory
      balancerTokenIds
      __typename
    }
    boost
    chainId
    gauge
    stash
    isShutdown
    isPhantomPool
    name
    price
    prevIds: prevPoolIds
    rewardPool
    totalStaked
    totalSupply
    tvl
    lpToken {
      ...Token
      __typename
    }
    rewards {
      id
      expired
      isMintedAura
      lastUpdateTime
      periodFinish
      queuedRewards
      rewardPerTokenStored
      rewardPerYear
      rewardRate
      token {
        ...Token
        __typename
      }
      __typename
    }
    token {
      ...Token
      __typename
    }
    tokens {
      ...Token
      __typename
    }
    tokenWeights
    aprs {
      breakdown {
        id
        token {
          ...Token
          __typename
        }
        name
        value
        __typename
      }
      stakingToken {
        ...Token
        __typename
      }
      total
      projectedBreakdown {
        id
        token {
          ...Token
          __typename
        }
        name
        value
        __typename
      }
      projectedTotal
      __typename
    }
    __typename
  }

  fragment Token on TokenSchema {
    __typename
    chainId
    address
    decimals
    symbol
    name
    price
    l1Token {
      address
      chainId
      symbol
      decimals
      name
      __typename
    }
  }
`;

const networkMapping = {
  1: 'ethereum',
  10: 'optimism',
  42161: 'arbitrum',
  137: 'polygon',
  100: 'gnosis',
};

const main = async () => {
  const response = await request(AURA_SUBGRAPH_ENDPOINT, AURA_POOLS_QUERY);

  if (!response || !response.pools) {
    return [];
  }

  return response.pools
    .filter(
      (pool) =>
        !!networkMapping[pool.chainId] &&
        !pool.isShutdown &&
        pool.aprs.total > 0 &&
        Number(pool.tvl) > 0
    )
    .map((pool) => {
      return {
        pool: `${pool.address}-${networkMapping[pool.chainId]}`,
        chain: utils.formatChain(networkMapping[pool.chainId]),
        project: 'aura',
        symbol: utils.formatSymbol(pool.token.symbol),
        tvlUsd: Number(pool.tvl),
        apy: pool.aprs.total,
        //TODO: add base and reward apy
        underlyingTokens: [pool.lpToken.address],
        rewardTokens: pool.rewards
          .filter((reward) => !reward.expired)
          .map((reward) => reward.token.address),
      };
    })
    .filter((i) => i.rewardTokens.length > 0);
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.aura.finance/',
};
