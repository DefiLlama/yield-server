const utils = require('../utils');
const { request, gql } = require('graphql-request');

const API_URL: string = 'https://api-mainnet.solidly.com/api/v1/pairs';

const SUBGRAPH_URL = 'https://api.thegraph.com/subgraphs/name/0xc30/solidly';

const swapPairsQuery = gql`
  query MyQuery {
    pairs {
      token0Price
      reserve0
      reserve1
      token1Price
      token1 {
        id
        symbol
        name
      }
      token0 {
        symbol
        name
        id
      }
      reserveUSD
      id
    }
  }
`;


type GraphPair = {
    token0Price: string
    reserve0: string
    reserve1: string
    token1Price: string
    token1: {
        id: string
        symbol: string
        name: string
    }
    token0: {
        symbol: string
        name: string
        id: string
    }
    reserveUSD: string
    id: string
}

const getPairs = async () => {
  const { pairs } = await request(SUBGRAPH_URL, swapPairsQuery, {});
  return pairs;
};

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
    // APR is retrieved using our api, tvl pairs etc trough subgraph
    const { data: poolsRes }: Response = await utils.getData(API_URL);

    const apyDict: any = {}

    for(const pool of poolsRes) {
        apyDict[pool.address.toLowerCase()] = pool.totalLpApr.current
    }

    const pairs = await getPairs();
    const pools = pairs.map((pair: GraphPair) => {
        return {
            pool: pair.id,
            chain: utils.formatChain('ethereum'),
            project: 'solidly-v2',
            symbol: `${pair.token0.symbol}-${pair.token1.symbol}`,
            tvlUsd: parseFloat(pair.reserveUSD),
            apyReward: parseFloat(apyDict[pair.id.toLowerCase()]),
            underlyingTokens: [pair.token0.id, pair.token1.id],
            rewardTokens: [
                '0x777172D858dC1599914a1C4c6c9fC48c99a60990', // solid
            ],
        };
    })

    return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://solidly.com/liquidity',
};