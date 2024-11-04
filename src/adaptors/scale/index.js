const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');
const abiPairFactory = require('./abiPairFactory.json');
const abiPair = require('./abiPair.json');
const abiGauge = require('./abiGauge.json');
const abiVoter = require('./abiVoter.json');

const pairFactory = '0xEd8db60aCc29e14bC867a497D94ca6e3CeB5eC04';
const voter = '0x46ABb88Ae1F2a35eA559925D99Fdc5441b592687';
const SCALE = '0x54016a4848a38f257B6E96331F7404073Fd9c32C';

const getApy = async () => {
  //We are looking for the pools that have gauge rewards, NOT the raw trade fee rewards
  const allPairsLength = (
    await sdk.api.abi.call({
      target: voter,
      abi: abiVoter.find((m) => m.name === 'length'),
      chain: 'base',
    })
  ).output;

  console.log('allPairsLength', allPairsLength);

  const allPairs = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(allPairsLength)).keys()].map((i) => ({
        target: voter,
        params: [i],
      })),
      abi: abiVoter.find((m) => m.name === 'pools'),
      chain: 'base',
    })
  ).output.map((o) => o.output);

  const metaData = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: i,
      })),
      abi: abiPair.find((m) => m.name === 'metadata'),
      chain: 'base',
    })
  ).output.map((o) => o.output);

  const symbols = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: i,
      })),
      abi: abiPair.find((m) => m.name === 'symbol'),
      chain: 'base',
    })
  ).output.map((o) => o.output);

  const gauges = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
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
        params: [SCALE],
      })),
      abi: abiGauge.find((m) => m.name === 'rewardRate'),
      chain: 'base',
    })
  ).output.map((o) => o.output);

  const tokens = [
    ...new Set(
      metaData
        .map((m) => [m.t0, m.t1])
        .flat()
        .concat(SCALE)
    ),
  ];

  const maxSize = 50;
  const pages = Math.ceil(tokens.length / maxSize);
  let pricesA = [];
  let keys = '';
  for (const p of [...Array(pages).keys()]) {
    keys = tokens
      .slice(p * maxSize, maxSize * (p + 1))
      .map((i) => `base:${i}`)
      .join(',')
      .replaceAll('/', '');
    pricesA = [
      ...pricesA,
      (await axios.get(`https://coins.llama.fi/prices/current/${keys}`)).data
        .coins,
    ];
  }
  let prices = {};
  for (const p of pricesA) {
    prices = { ...prices, ...p };
  }

  const pools = allPairs.map((p, i) => {
    const poolMeta = metaData[i];
    const r0 = poolMeta.r0 / poolMeta.dec0;
    const r1 = poolMeta.r1 / poolMeta.dec1;

    const p0 = prices[`base:${poolMeta.t0}`]?.price;
    const p1 = prices[`base:${poolMeta.t1}`]?.price;

    const tvlUsd = r0 * p0 + r1 * p1;

    const s = symbols[i];

    const rewardPerSec =
      (rewardRate[i] / 1e18) * prices[`base:${SCALE}`]?.price;
    const apyReward = ((rewardPerSec * 86400 * 365) / tvlUsd) * 100;

    return {
      pool: p,
      chain: utils.formatChain('base'),
      project: 'scale',
      symbol: utils.formatSymbol(s.split('-')[1]),
      tvlUsd,
      apyReward,
      rewardTokens: apyReward ? [SCALE] : [],
      underlyingTokens: [poolMeta.t0, poolMeta.t1],
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://base.equalizer.exchange/liquidity',
};
