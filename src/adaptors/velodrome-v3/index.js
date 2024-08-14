const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');

const abiSugar = require('./abiSugar.json');
const abiSugarHelper = require('./abiSugarHelper.json');

const VELO = '0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db';
const sugar = '0x39F850019b85c59BCa2fa0E437fBA8cEfc84528D';
const sugarHelper = '0x5Bd7E2221C2d59c99e6A9Cd18D80A5F4257D0f32';
const nullAddress = '0x0000000000000000000000000000000000000000';

const tickWidthMappings = {1: 5, 50: 5, 100: 15, 200: 10, 2000: 2};

const getApy = async () => {

  const chunkSize = 400;
  let currentOffset = 630; // Ignore older non-Slipstream pools
  let unfinished = true;
  let allPoolsData = [];

  while (unfinished) {
    const poolsChunkUnfiltered = (
      await sdk.api.abi.call({
        target: sugar,
        params: [chunkSize, currentOffset],
        abi: abiSugar.find((m) => m.name === 'all'),
        chain: 'optimism',
      })
    ).output;
    
    const poolsChunk = poolsChunkUnfiltered.filter(t => Number(t.type) > 0 && t.gauge != nullAddress);

    unfinished = poolsChunkUnfiltered.length !== 0;
    currentOffset += chunkSize;
    allPoolsData.push(...poolsChunk);
  }

  unfinished = true;
  currentOffset = 0;
  let allTokenData = [];

  while (unfinished) {
    const tokensChunk = (
      await sdk.api.abi.call({
        target: sugar,
        params: [chunkSize, currentOffset, sugar, []],
        abi: abiSugar.find((m) => m.name === 'tokens'),
        chain: 'optimism',
      })
    ).output;

    unfinished = tokensChunk.length !== 0;
    currentOffset += chunkSize;
    allTokenData.push(...tokensChunk);
  }

  const tokens = [
    ...new Set(
      allPoolsData
        .map((m) => [m.token0, m.token1])
        .flat()
        .concat(VELO)
    ),
  ];

  const maxSize = 50;
  const pages = Math.ceil(tokens.length / maxSize);
  let pricesA = [];
  let x = '';
  for (const p of [...Array(pages).keys()]) {
    x = tokens
      .slice(p * maxSize, maxSize * (p + 1))
      .map((i) => `optimism:${i}`)
      .join(',')
      .replaceAll('/', '');
    pricesA = [
      ...pricesA,
      (await axios.get(`https://coins.llama.fi/prices/current/${x}`)).data
        .coins,
    ];
  }
  let prices = {};
  for (const p of pricesA.flat()) {
    prices = { ...prices, ...p };
  }

  let allStakedData = [];
  for (pool of allPoolsData) {
    // don't waste RPC calls if gauge has no staked liquidity
    if (Number(pool.gauge_liquidity) == 0) {
      allStakedData.push({'amount0': 0, 'amount1': 0});
      continue;
    }

    const wideTickAmount = tickWidthMappings[Number(pool.type)] !== undefined ? tickWidthMappings[Number(pool.type)] : 5;
    const lowTick = Number(pool.tick) - (wideTickAmount * Number(pool.type));
    const highTick = Number(pool.tick) + ((wideTickAmount - 1) * Number(pool.type));

    const ratioA = (
      await sdk.api.abi.call({
        target: sugarHelper,
        params: [lowTick],
        abi: abiSugarHelper.find((m) => m.name === 'getSqrtRatioAtTick'),
        chain: 'optimism',
      })
    ).output;

    const ratioB = (
      await sdk.api.abi.call({
        target: sugarHelper,
        params: [highTick],
        abi: abiSugarHelper.find((m) => m.name === 'getSqrtRatioAtTick'),
        chain: 'optimism',
      })
    ).output;

    // fetch staked liquidity around wide set of ticks
    const stakedAmounts = (
      await sdk.api.abi.call({
        target: sugarHelper,
        params: [pool.sqrt_ratio, ratioA, ratioB, pool.gauge_liquidity],
        abi: abiSugarHelper.find((m) => m.name === 'getAmountsForLiquidity'),
        chain: 'optimism',
      })
    ).output;

    allStakedData.push(stakedAmounts);
  }

  const pools = allPoolsData.map((p, i) => {
    const token0Data = allTokenData.find(({token_address}) => token_address == p.token0);
    const token1Data = allTokenData.find(({token_address}) => token_address == p.token1);
    
    const p0 = prices[`optimism:${p.token0}`]?.price;
    const p1 = prices[`optimism:${p.token1}`]?.price;

    const tvlUsd = ((p.reserve0 / (10**token0Data.decimals)) * p0) + ((p.reserve1 / (10**token1Data.decimals)) * p1);
    
    // use wider staked TVL across many ticks
    const stakedTvlUsd = ((allStakedData[i]['amount0'] / (10**token0Data.decimals)) * p0) + ((allStakedData[i]['amount1'] / (10**token1Data.decimals)) * p1);

    const s = token0Data.symbol + '-' + token1Data.symbol;

    const apyReward =
      (((p.emissions / 1e18) * 86400 * 365 * prices[`optimism:${VELO}`]?.price) /
        stakedTvlUsd) *
      100;

    const url = 'https://velodrome.finance/deposit?token0=' + p.token0 + '&token1=' + p.token1 + '&type=' + p.type.toString() + '&factory=' + p.factory;
    const poolMeta = 'CL' + p.type.toString() + ' - ' + (p.pool_fee / 10000).toString() + '%';

    return {
      pool: p.lp,
      chain: utils.formatChain('optimism'),
      project: 'velodrome-v3',
      symbol: s,
      tvlUsd,
      apyReward,
      rewardTokens: apyReward ? [VELO] : [],
      underlyingTokens: [p.token0, p.token1],
      poolMeta,
      url,
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
};