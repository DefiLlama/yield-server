const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');
const abiPairFactory = require('./abiPairFactory.json');
const abiPair = require('./abiPair.json');
const abiGauge = require('./abiGauge.json');
const abiVoter = require('./abiVoter.json');

const pairFactory = '0xce9240869391928253ed9cc9bcb8cb98cb5b0722';
const voter = '0xc72b5c6d2c33063e89a50b2f77c99193ae6cee6c';
const CHR = '0x15b2fb8f08e4ac1ce019eadae02ee92aedf06851';

const project = 'chronos-v1';

const getApy = async () => {
  const allPairsLength = (
    await sdk.api.abi.call({
      target: pairFactory,
      abi: abiPairFactory.find((m) => m.name === 'allPairsLength'),
      chain: 'arbitrum',
    })
  ).output;

  const allPairs = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(allPairsLength)).keys()].map((i) => ({
        target: pairFactory,
        params: [i],
      })),
      abi: abiPairFactory.find((m) => m.name === 'allPairs'),
      chain: 'arbitrum',
    })
  ).output.map((o) => o.output);

  const metaData = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: i,
      })),
      abi: abiPair.find((m) => m.name === 'metadata'),
      chain: 'arbitrum',
    })
  ).output.map((o) => o.output);

  const symbols = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: i,
      })),
      abi: abiPair.find((m) => m.name === 'symbol'),
      chain: 'arbitrum',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const gauges = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: voter,
        params: [i],
      })),
      abi: abiVoter.find((m) => m.name === 'gauges'),
      chain: 'arbitrum',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const rewardRate = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((i) => ({
        target: i,
      })),
      abi: abiGauge.find((m) => m.name === 'rewardRate'),
      chain: 'arbitrum',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const totalWeight = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((i) => ({
        target: i,
      })),
      abi: abiGauge.find((m) => m.name === 'totalWeight'),
      chain: 'arbitrum',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((i) => ({
        target: i,
      })),
      abi: abiGauge.find((m) => m.name === 'totalSupply'),
      chain: 'arbitrum',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const tokens = [
    ...new Set(
      metaData
        .map((m) => [m.t0, m.t1])
        .flat()
        .concat(CHR)
    ),
  ];
  const priceKeys = tokens
    .map((i) => `arbitrum:${i}`)
    .concat('coingecko:usd-freedom')
    .join(',');

  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const pools = allPairs.map((p, i) => {
    const poolMeta = metaData[i];
    const r0 = poolMeta.r0 / poolMeta.dec0;
    const r1 = poolMeta.r1 / poolMeta.dec1;

    const p0 =
      poolMeta.t0 === '0xae48b7C8e096896E32D53F10d0Bf89f82ec7b987'
        ? prices['coingecko:usd-freedom']?.price
        : prices[`arbitrum:${poolMeta.t0}`]?.price;
    const p1 = prices[`arbitrum:${poolMeta.t1}`]?.price;

    const tvlUsd = r0 * p0 + r1 * p1;

    const s = symbols[i];

    const pairPrice = (tvlUsd * 1e18) / totalSupply[i];
    const totalRewardPerDay =
      ((rewardRate[i] * 86400) / 1e18) * prices[`arbitrum:${CHR}`]?.price;

    const apyReward =
      (totalRewardPerDay * 36500) / ((totalWeight[i] * pairPrice) / 1e18);

    return {
      pool: p,
      chain: utils.formatChain('arbitrum'),
      project,
      symbol: utils.formatSymbol(s.split('-')[1]),
      tvlUsd,
      apyReward,
      rewardTokens: apyReward ? [CHR] : [],
      underlyingTokens: [poolMeta.t0, poolMeta.t1],
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.chronos.exchange/liquidity',
};
