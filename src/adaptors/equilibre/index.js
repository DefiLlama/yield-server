const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');
const abiPairFactory = require('./abiPairFactory.json');
const abiPair = require('./abiPair.json');
const abiGauge = require('./abiGauge.json');
const abiVoter = require('./abiVoter.json');

const pairFactory = '0xA138FAFc30f6Ec6980aAd22656F2F11C38B56a95';
const voter = '0x4eB2B9768da9Ea26E3aBe605c9040bC12F236a59';
const VARA = '0xe1da44c0da55b075ae8e2e4b6986adc76ac77d73';

const getApy = async () => {
  const allPairsLength = (
    await sdk.api.abi.call({
      target: pairFactory,
      abi: abiPairFactory.find((m) => m.name === 'allPairsLength'),
      chain: 'kava',
    })
  ).output;

  const allPairs = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(allPairsLength)).keys()].map((i) => ({
        target: pairFactory,
        params: [i],
      })),
      abi: abiPairFactory.find((m) => m.name === 'allPairs'),
      chain: 'kava',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const metaData = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: i,
      })),
      abi: abiPair.find((m) => m.name === 'metadata'),
      chain: 'kava',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const symbols = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: i,
      })),
      abi: abiPair.find((m) => m.name === 'symbol'),
      chain: 'kava',
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
      chain: 'kava',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const rewardRate = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((i) => ({
        target: i,
        params: [VARA],
      })),
      abi: abiGauge.find((m) => m.name === 'rewardRate'),
      chain: 'kava',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const derivedSupply = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((i) => ({
        target: i,
      })),
      abi: abiGauge.find((m) => m.name === 'derivedSupply'),
      chain: 'kava',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((i) => ({
        target: i,
      })),
      abi: abiGauge.find((m) => m.name === 'totalSupply'),
      chain: 'kava',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const tokens = [
    ...new Set(
      metaData
        .map((m) => [m.t0, m.t1])
        .flat()
        .concat(VARA)
    ),
  ];

  const priceKeys = tokens.map((i) => `kava:${i}`).join(',');

  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const pools = allPairs.map((p, i) => {
    const poolMeta = metaData[i];

    const r0 = poolMeta.r0 / poolMeta.dec0;
    const r1 = poolMeta.r1 / poolMeta.dec1;

    const p0 = prices[`kava:${poolMeta.t0}`]?.price;
    const p1 = prices[`kava:${poolMeta.t1}`]?.price;

    // we don't have price data for some of the tokens
    let tvlUsd;
    if (p0 && p1) {
      tvlUsd = r0 * p0 + r1 * p1;
    } else if (p0 && !p1) {
      tvlUsd = r0 * p0 * 2;
    } else if (!p0 && p1) {
      tvlUsd = r1 * p1 * 2;
    } else return {};

    const s = symbols[i];

    const pairPrice = (tvlUsd * 1e18) / totalSupply[i];
    const totalRewardPerDay =
      ((rewardRate[i] * 86400) / 1e18) * prices[`kava:${VARA}`]?.price;

    const apyReward =
      (totalRewardPerDay * 36500) / ((derivedSupply[i] * pairPrice) / 1e18);

    return {
      pool: p.toLowerCase(),
      chain: utils.formatChain('kava'),
      project: 'equilibre',
      symbol: utils.formatSymbol(s.split('-')[1]),
      tvlUsd,
      apyReward,
      rewardTokens: apyReward ? [VARA] : [],
      underlyingTokens: [poolMeta.t0, poolMeta.t1],
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://equilibrefinance.com/liquidity',
};
