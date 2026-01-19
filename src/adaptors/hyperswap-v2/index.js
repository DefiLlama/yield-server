const sdk = require('@defillama/sdk');
const axios = require('axios');
const utils = require('../utils');

const PROJECT = 'hyperswap-v2';
const CHAIN = 'hyperevm';
const SDK_CHAIN = 'hyperliquid';
const MIN_TVL_USD = 10000;

const FACTORY_ADDRESS = '0x724412C00059bf7d6ee7d4a1d0D5cd4de3ea1C48';

const factoryAbi = {
  allPairsLength: {
    inputs: [],
    name: 'allPairsLength',
    outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    stateMutability: 'view',
    type: 'function',
  },
  allPairs: {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'allPairs',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
};

const pairAbi = {
  token0: {
    inputs: [],
    name: 'token0',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  token1: {
    inputs: [],
    name: 'token1',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
  getReserves: {
    inputs: [],
    name: 'getReserves',
    outputs: [
      { internalType: 'uint112', name: '_reserve0', type: 'uint112' },
      { internalType: 'uint112', name: '_reserve1', type: 'uint112' },
      { internalType: 'uint32', name: '_blockTimestampLast', type: 'uint32' },
    ],
    stateMutability: 'view',
    type: 'function',
  },
};

async function getPrices(tokens) {
  const BATCH_SIZE = 50;
  const uniqueTokens = [...new Set(tokens)];
  const prices = {};

  for (let i = 0; i < uniqueTokens.length; i += BATCH_SIZE) {
    const batch = uniqueTokens.slice(i, i + BATCH_SIZE);
    const priceKeys = batch.map((t) => `${SDK_CHAIN}:${t}`).join(',');

    try {
      const response = await axios.get(
        `https://coins.llama.fi/prices/current/${priceKeys}`
      );
      const coins = response.data.coins || {};

      for (const [key, data] of Object.entries(coins)) {
        const address = key.split(':')[1].toLowerCase();
        prices[address] = data.price;
      }
    } catch (error) {
      // Continue with other batches
    }
  }

  return prices;
}

async function apy() {
  const allPairsLength = (
    await sdk.api.abi.call({
      target: FACTORY_ADDRESS,
      abi: factoryAbi.allPairsLength,
      chain: SDK_CHAIN,
    })
  ).output;

  const pairCount = Number(allPairsLength);
  if (pairCount === 0) return [];

  const allPairsResult = await sdk.api.abi.multiCall({
    calls: [...Array(pairCount).keys()].map((i) => ({
      target: FACTORY_ADDRESS,
      params: [i],
    })),
    abi: factoryAbi.allPairs,
    chain: SDK_CHAIN,
    permitFailure: true,
  });

  const pairs = allPairsResult.output
    .map((o) => o.output?.toLowerCase())
    .filter(Boolean);

  if (pairs.length === 0) return [];

  const [token0Results, token1Results, reservesResults] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: pairs.map((pair) => ({ target: pair })),
      abi: pairAbi.token0,
      chain: SDK_CHAIN,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      calls: pairs.map((pair) => ({ target: pair })),
      abi: pairAbi.token1,
      chain: SDK_CHAIN,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      calls: pairs.map((pair) => ({ target: pair })),
      abi: pairAbi.getReserves,
      chain: SDK_CHAIN,
      permitFailure: true,
    }),
  ]);

  const pairData = pairs
    .map((pair, i) => {
      const token0 = token0Results.output[i]?.output?.toLowerCase();
      const token1 = token1Results.output[i]?.output?.toLowerCase();
      const reserves = reservesResults.output[i]?.output;
      const reserve0 = reserves?._reserve0 || reserves?.[0];
      const reserve1 = reserves?._reserve1 || reserves?.[1];

      if (!token0 || !token1 || !reserve0 || !reserve1) return null;

      return { id: pair, token0, token1, reserve0, reserve1 };
    })
    .filter(Boolean);

  if (pairData.length === 0) return [];

  const allTokens = [...new Set(pairData.flatMap((p) => [p.token0, p.token1]))];

  const [decimalsResults, prices] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: allTokens.map((token) => ({ target: token })),
      abi: 'erc20:decimals',
      chain: SDK_CHAIN,
      permitFailure: true,
    }),
    getPrices(allTokens),
  ]);

  const decimals = {};
  allTokens.forEach((token, i) => {
    decimals[token] = Number(decimalsResults.output[i]?.output) || 18;
  });

  const qualifyingPools = pairData
    .map((pair) => {
      const reserve0 =
        Number(pair.reserve0) / Math.pow(10, decimals[pair.token0]);
      const reserve1 =
        Number(pair.reserve1) / Math.pow(10, decimals[pair.token1]);

      const price0 = prices[pair.token0] || 0;
      const price1 = prices[pair.token1] || 0;

      const tvlUsd = reserve0 * price0 + reserve1 * price1;
      if (tvlUsd < MIN_TVL_USD) return null;

      return { ...pair, tvlUsd };
    })
    .filter(Boolean);

  if (qualifyingPools.length === 0) return [];

  const qualifyingTokens = [
    ...new Set(qualifyingPools.flatMap((p) => [p.token0, p.token1])),
  ];

  const symbolResults = await sdk.api.abi.multiCall({
    calls: qualifyingTokens.map((token) => ({ target: token })),
    abi: 'erc20:symbol',
    chain: SDK_CHAIN,
    permitFailure: true,
  });

  const symbols = {};
  qualifyingTokens.forEach((token, i) => {
    symbols[token] = symbolResults.output[i]?.output || 'UNKNOWN';
  });

  return qualifyingPools
    .map((pool) => {
      const symbol = utils.formatSymbol(
        `${symbols[pool.token0]}-${symbols[pool.token1]}`
      );

      return {
        pool: pool.id,
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol,
        tvlUsd: pool.tvlUsd,
        apyBase: 0,
        underlyingTokens: [pool.token0, pool.token1],
        url: `https://app.hyperswap.exchange/#/add/v2/${pool.token0}/${pool.token1}`,
      };
    })
    .filter(utils.keepFinite);
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.hyperswap.exchange',
};
