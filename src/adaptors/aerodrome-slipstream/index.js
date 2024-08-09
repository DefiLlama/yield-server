const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');

const abiSugar = require('./abiSugar.json');

const AERO = '0x940181a94A35A4569E4529A3CDfB74e38FD98631';
const sugar = '0x68c19e13618C41158fE4bAba1B8fb3A9c74bDb0A';

const getApy = async () => {

  const chunkSize = 400;
  let currentOffset = 1650; // Ignore older non-Slipstream pools
  let unfinished = true;
  let allPoolsData = [];

  while (unfinished) {
    const poolsChunkUnfiltered = (
      await sdk.api.abi.call({
        target: sugar,
        params: [chunkSize, currentOffset],
        abi: abiSugar.find((m) => m.name === 'all'),
        chain: 'base',
      })
    ).output;
    
    const poolsChunk = poolsChunkUnfiltered.filter(t => Number(t.type) > 0);

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
        chain: 'base',
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
        .concat(AERO)
    ),
  ];

  const maxSize = 50;
  const pages = Math.ceil(tokens.length / maxSize);
  let pricesA = [];
  let x = '';
  for (const p of [...Array(pages).keys()]) {
    x = tokens
      .slice(p * maxSize, maxSize * (p + 1))
      .map((i) => `base:${i}`)
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

  const pools = allPoolsData.map((p, i) => {
    const token0Data = allTokenData.find(({token_address}) => token_address == p.token0);
    const token1Data = allTokenData.find(({token_address}) => token_address == p.token1);
    
    const p0 = prices[`base:${p.token0}`]?.price;
    const p1 = prices[`base:${p.token1}`]?.price;

    const tvlUsd = ((p.reserve0 / (10**token0Data.decimals)) * p0) + ((p.reserve1 / (10**token1Data.decimals)) * p1);
    const stakedTvlUsd = ((p.staked0 / (10**token0Data.decimals)) * p0) + ((p.staked1 / (10**token1Data.decimals)) * p1);

    const s = token0Data.symbol + '-' + token1Data.symbol;

    const apyReward =
      (((p.emissions / 1e18) * 86400 * 365 * prices[`base:${AERO}`]?.price) /
        stakedTvlUsd) *
      100;

    const url = 'https://aerodrome.finance/deposit?token0=' + p.token0 + '&token1=' + p.token1 + '&type=' + p.type.toString() + '&factory=' + p.factory;
    const poolMeta = 'CL' + p.type.toString() + ' - ' + (p.pool_fee / 10000).toString() + '%';

    return {
      pool: p.lp,
      chain: utils.formatChain('base'),
      project: 'aerodrome-slipstream',
      symbol: s,
      tvlUsd,
      apyReward,
      rewardTokens: apyReward ? [AERO] : [],
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
