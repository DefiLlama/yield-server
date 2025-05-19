const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const axios = require('axios');
const utils = require('../utils');

const SUBGRAPH_URL = "https://thegraph.coredao.org/subgraphs/name/glyph/glyph-exchange-v2";
const liquidityPairFeeRate = 0.003;
const WCORE_TOKEN_ADDRESS = '0x191e94fa59739e188dce837f7f6978d84727ad01';
const NATIVE_TOKEN_ADDRESS = '0x0000000000000000000000000000000000000000';
const USDT_ADDRESS = '0x81ecac0d6be0550a00ff064a4f9dd2400585fe9c';

const PAIR_VOLUME_DAYS_QUERY = gql`
  query PairVolumeDays($first: Int!, $skip: Int!, $timestamp_gte: BigInt!) {
    pairVolumeDays(
      first: $first
      skip: $skip
      where: { timestamp_gte: $timestamp_gte }
    ) {
      volumeUsd
      pair { id }
    }
  }
`;

const PAIRS_QUERY = gql`
  query Pairs($first: Int!) {
    pairs(first: $first) {
      id
      reserve0
      reserve1
      token0 { id symbol decimals derivedCORE }
      token1 { id symbol decimals derivedCORE }
      supply
      totalVolumeUsd
      token0Price
      token1Price
    }
  }
`;

const getAllPairVolumeDays = async (timestamp_gte) => {
  const volumeDays = [];
  let skip = 0;
  const first = 1000;
  
  while (true) {
    const result = await request(SUBGRAPH_URL, PAIR_VOLUME_DAYS_QUERY, {
      first,
      skip,
      timestamp_gte
    });
    
    volumeDays.push(...result.pairVolumeDays);
    if (result.pairVolumeDays.length < first) break;
    skip += first;
  }
  
  return volumeDays;
};

const getWcoreUsdtPrice = async () => {
  const response = await axios.get(`https://coins.llama.fi/prices/current/core:${NATIVE_TOKEN_ADDRESS}`);
  return response.data.coins[`core:${NATIVE_TOKEN_ADDRESS}`]?.price || 0;
};

const calculateTVL = async (pairs) => {
  const tokenPrices = {};
  tokenPrices[USDT_ADDRESS] = 1;
  tokenPrices[WCORE_TOKEN_ADDRESS] = await getWcoreUsdtPrice();

  return pairs.map(pair => {
    const reserve0 = Number(pair.reserve0);
    const reserve1 = Number(pair.reserve1);
    
    let token0Price = tokenPrices[pair.token0.id];
    let token1Price = tokenPrices[pair.token1.id];

    if (!token0Price && pair.token0.derivedCORE && tokenPrices[WCORE_TOKEN_ADDRESS]) {
      token0Price = Number(pair.token0.derivedCORE) * tokenPrices[WCORE_TOKEN_ADDRESS];
      tokenPrices[pair.token0.id] = token0Price;
    }

    if (!token1Price && pair.token1.derivedCORE && tokenPrices[WCORE_TOKEN_ADDRESS]) {
      token1Price = Number(pair.token1.derivedCORE) * tokenPrices[WCORE_TOKEN_ADDRESS];
      tokenPrices[pair.token1.id] = token1Price;
    }

    const reserve0USD = reserve0 * (token0Price || 0);
    const reserve1USD = reserve1 * (token1Price || 0);

    let tvlUsd;
    if (token0Price && token1Price) {
      tvlUsd = reserve0USD + reserve1USD;
    } else if (token0Price) {
      tvlUsd = reserve0USD * 2;
    } else if (token1Price) {
      tvlUsd = reserve1USD * 2;
    } else {
      tvlUsd = 0;
    }

    return {
      ...pair,
      tvlUsd,
      token0Price,
      token1Price
    };
  });
};

const main = async () => {
  const chain = 'core';
  const currentTimestamp = Math.floor(Date.now() / 1000);
  const yearAgoTimestamp = currentTimestamp - 365 * 24 * 60 * 60;

  const { pairs } = await request(SUBGRAPH_URL, PAIRS_QUERY, { first: 1000 });
  const pairsWithTVL = await calculateTVL(pairs);
  
  const allVolumeDays = await getAllPairVolumeDays(yearAgoTimestamp);
  const volumeByPair = allVolumeDays.reduce((acc, day) => {
    acc[day.pair.id] = (acc[day.pair.id] || 0) + Number(day.volumeUsd);
    return acc;
  }, {});

  return pairsWithTVL.map(pair => ({
    pool: `${pair.id}-${chain}`.toLowerCase(),
    chain: utils.formatChain(chain),
    project: 'glyph-v2',
    symbol: `${pair.token0.symbol}-${pair.token1.symbol}`,
    tvlUsd: pair.tvlUsd,
    apyBase: pair.tvlUsd > 0 ? 
      (volumeByPair[pair.id] || 0) * liquidityPairFeeRate / pair.tvlUsd * 100 : 0,
    underlyingTokens: [pair.token0.id, pair.token1.id],
    url: `https://app.glyph.exchange/pool/?type=v2&address=${pair.id}`,
  }))
  .filter(p => p.tvlUsd >= 10000)
  .filter(p => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};