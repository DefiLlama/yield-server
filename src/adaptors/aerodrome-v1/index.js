const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');

const abiPoolsFactory = require('./abiPoolsFactory.json');

const abiPool = require('./abiPool.json');
const abiGauge = require('./abiGauge.json');
const abiVoter = require('./abiVoter.json');

const poolsFactory = '0x420DD381b31aEf6683db6B902084cB0FFECe40Da';
const voter = '0x16613524e02ad97eDfeF371bC883F2F5d6C480A5';
const AERO = '0x940181a94A35A4569E4529A3CDfB74e38FD98631';

const getApy = async () => {
  const allPoolsLength = (
    await sdk.api.abi.call({
      target: poolsFactory,
      abi: abiPoolsFactory.find((m) => m.name === 'allPoolsLength'),
      chain: 'base',
    })
  ).output;

  const allPools = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(allPoolsLength)).keys()].map((i) => ({
        target: poolsFactory,
        params: [i],
      })),
      abi: abiPoolsFactory.find((m) => m.name === 'allPools'),
      chain: 'base',
    })
  ).output.map((o) => o.output);

  const metaData = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({
        target: i,
      })),
      abi: abiPool.find((m) => m.name === 'metadata'),
      chain: 'base',
    })
  ).output.map((o) => o.output);

  const symbols = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({
        target: i,
      })),
      abi: abiPool.find((m) => m.name === 'symbol'),
      chain: 'base',
    })
  ).output.map((o) => o.output);

  const gauges = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({
        target: voter,
        params: [i],
      })),
      abi: abiVoter.find((m) => m.name === 'gauges'),
      chain: 'base',
    })
  ).output.map((o) => o.output);

  const rewardRate = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((i) => ({
        target: i,
      })),
      abi: abiGauge.find((m) => m.name === 'rewardRate'),
      chain: 'base',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((i) => ({
        target: i,
      })),
      abi: abiGauge.find((m) => m.name === 'totalSupply'),
      chain: 'base',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const tokens = [
    ...new Set(
      metaData
        .map((m) => [m.t0, m.t1])
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

  const pools = allPools.map((p, i) => {
    const poolMeta = metaData[i];
    const r0 = poolMeta.r0 / poolMeta.dec0;
    const r1 = poolMeta.r1 / poolMeta.dec1;

    const p0 = prices[`base:${poolMeta.t0}`]?.price;
    const p1 = prices[`base:${poolMeta.t1}`]?.price;

    const tvlUsd = r0 * p0 + r1 * p1;

    const s = symbols[i];

    const pairPrice = (tvlUsd * 1e18) / totalSupply[i];
    const apyReward =
      (((rewardRate[i] / 1e18) * 86400 * 365 * prices[`base:${AERO}`]?.price) /
        tvlUsd) *
      100;

    return {
      pool: p,
      chain: utils.formatChain('base'),
      project: 'aerodrome-v1',
      symbol: utils.formatSymbol(s.split('-')[1]),
      tvlUsd,
      apyReward,
      rewardTokens: apyReward ? [AERO] : [],
      underlyingTokens: [poolMeta.t0, poolMeta.t1],
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://aerodrome.finance/liquidity',
};
