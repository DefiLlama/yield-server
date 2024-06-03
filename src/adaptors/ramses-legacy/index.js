const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');
const abiPairFactory = require('./abiPairFactory.json');
const abiPair = require('./abiPair.json');
const abiGauge = require('./abiGauge.json');
const abiVoter = require('./abiVoter.json');

const pairFactory = '0xAAA20D08e59F6561f242b08513D36266C5A29415';
const voter = '0xAAA2564DEb34763E3d05162ed3f5C2658691f499';
const RAM = '0xAAA6C1E32C55A7Bfa8066A6FAE9b42650F262418';

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
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const metaData = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: i,
      })),
      abi: abiPair.find((m) => m.name === 'metadata'),
      chain: 'arbitrum',
      permitFailure: true,
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
        params: [RAM],
      })),
      abi: abiGauge.find((m) => m.name === 'rewardRate'),
      chain: 'arbitrum',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const derivedSupply = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((i) => ({
        target: i,
      })),
      abi: abiGauge.find((m) => m.name === 'derivedSupply'),
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
        .concat(RAM)
    ),
  ];
  const priceKeys = tokens.map((i) => `arbitrum:${i}`).join(',');

  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const pools = allPairs.map((p, i) => {
    const poolMeta = metaData[i];
    const r0 = poolMeta.r0 / poolMeta.dec0;
    const r1 = poolMeta.r1 / poolMeta.dec1;

    const p0 = prices[`arbitrum:${poolMeta.t0}`]?.price;
    const p1 = prices[`arbitrum:${poolMeta.t1}`]?.price;

    const tvlUsd = r0 * p0 + r1 * p1;

    const s = symbols[i];

    const pairPrice = (tvlUsd * 1e18) / totalSupply[i];
    const totalRewardPerDay =
      ((rewardRate[i] * 86400) / 1e18) * prices[`arbitrum:${RAM}`]?.price;

    const apyReward =
      (totalRewardPerDay * 36500) /
      ((derivedSupply[i] * pairPrice) / 1e18) /
      2.5;

    return {
      pool: p,
      chain: utils.formatChain('arbitrum'),
      project: 'ramses-legacy',
      symbol: utils.formatSymbol(s.split('-')[1]),
      tvlUsd,
      apyReward,
      rewardTokens: apyReward ? [RAM] : [],
      underlyingTokens: [poolMeta.t0, poolMeta.t1],
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.ramses.exchange/liquidity',
};
