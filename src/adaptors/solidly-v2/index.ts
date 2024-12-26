const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { request, gql } = require('graphql-request');

const API_URL: string = 'https://api-mainnet.solidly.com/api/v1/pairs';

const SUBGRAPH_URL = sdk.graph.modifyEndpoint(
  sdk.graph.modifyEndpoint('4GX8RE9TzEWormbkayeGj4NQmmhYE46izVVUvXv8WPDh')
);

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
  token0Price: string;
  reserve0: string;
  reserve1: string;
  token1Price: string;
  token1: {
    id: string;
    symbol: string;
    name: string;
  };
  token0: {
    symbol: string;
    name: string;
    id: string;
  };
  reserveUSD: string;
  id: string;
};

const getPairs = async () => {
  const { pairs } = await request(SUBGRAPH_URL, swapPairsQuery, {});
  return pairs;
};

type PoolToken = {
  address: string;
  symbol: string;
};

type AprObject = {
  current: string;
  projected: string;
  lastWeek: string;
};

interface Pool {
  address: string;
  token0: PoolToken;
  token1: PoolToken;
  totalTvlUsd: string;
  totalLpApr: AprObject;
}

interface Response {
  data: Array<Pool>;
}

const getApy = async () => {
  // APR is retrieved using our api, tvl pairs etc trough subgraph
  const { data: poolsRes }: Response = await utils.getData(API_URL);

  const apyDict: any = {};
  const alreadySeen = [];
  let priceApiCoins = '';

  for (const pool of poolsRes) {
    apyDict[pool.address.toLowerCase()] = pool.totalLpApr.current;
  }

  const pairs = await getPairs();
  for (const pair of pairs) {
    const token0Key = 'ethereum:' + pair.token0.id.toLowerCase();
    const token1Key = 'ethereum:' + pair.token1.id.toLowerCase();

    if (!alreadySeen.includes(token0Key)) {
      alreadySeen.push(token0Key);
      priceApiCoins += token0Key + ',';
    }

    if (!alreadySeen.includes(token1Key)) {
      alreadySeen.push(token1Key);
      priceApiCoins += token1Key + ',';
    }
  }

  // asking price to defillama chunking requests (currently running with 1 request could be lowered if needed)
  let fullCoin = {};
  const chunkSize = 60;
  for (let i = 0; i < alreadySeen.length; i += chunkSize) {
    const chunk = alreadySeen.slice(i, i + chunkSize);

    const { coins }: any = await utils.getData(
      `https://coins.llama.fi/prices/current/${chunk.join(',')}?searchWidth=4h`
    );
    fullCoin = { ...fullCoin, ...coins };
  }

  const pools = pairs.map((pair: GraphPair) => {
    let tvl = 0;

    if (
      fullCoin['ethereum:' + pair.token0.id.toLowerCase()] &&
      fullCoin['ethereum:' + pair.token1.id.toLowerCase()]
    ) {
      const token0ValueInReserve =
        parseFloat(pair.reserve0) *
        parseFloat(fullCoin['ethereum:' + pair.token0.id.toLowerCase()].price);
      const token1ValueInReserve =
        parseFloat(pair.reserve1) *
        parseFloat(fullCoin['ethereum:' + pair.token1.id.toLowerCase()].price);

      tvl = token0ValueInReserve + token1ValueInReserve;
    } else {
      // fallbacking to the one from api if defillama price are missing
      tvl = parseFloat(pair.reserveUSD);
    }

    return {
      pool: pair.id,
      chain: utils.formatChain('ethereum'),
      project: 'solidly-v2',
      symbol: `${pair.token0.symbol}-${pair.token1.symbol}`,
      tvlUsd: tvl,
      apyReward: parseFloat(apyDict[pair.id.toLowerCase()]),
      underlyingTokens: [pair.token0.id, pair.token1.id],
      rewardTokens: [
        '0x777172D858dC1599914a1C4c6c9fC48c99a60990', // solid
      ],
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://solidly.com/liquidity',
};
