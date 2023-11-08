const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');
const abiPairFactory = require('./abiPairFactory.json');
const abiPair = require('./abiPair.json');
const abiGauge = require('./abiGauge.json');
const abiVoter = require('./abiVoter.json');

const pairFactory = '0xaC7B7EaC8310170109301034b8FdB75eCa4CC491';
const voter = '0x4199Cf7D3cd8F92BAFBB97fF66caE507888b01F9';
const GLCR = '0x3712871408a829C5cd4e86DA1f4CE727eFCD28F6';

const getApy = async () => {
  const allPairsLength = (
    await sdk.api.abi.call({
      target: pairFactory,
      abi: abiPairFactory.find((m) => m.name === 'allPairsLength'),
      chain: 'avax',
    })
  ).output;

  const allPairs = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(allPairsLength)).keys()].map((i) => ({
        target: pairFactory,
        params: [i],
      })),
      abi: abiPairFactory.find((m) => m.name === 'allPairs'),
      chain: 'avax',
    })
  ).output.map((o) => o.output);

  const metaData = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: i,
      })),
      abi: abiPair.find((m) => m.name === 'metadata'),
      chain: 'avax',
    })
  ).output.map((o) => o.output);

  const symbols = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: i,
      })),
      abi: abiPair.find((m) => m.name === 'symbol'),
      chain: 'avax',
    })
  ).output.map((o) => o.output);

  const gauges = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: voter,
        params: [i],
      })),
      abi: abiVoter.find((m) => m.name === 'gauges'),
      chain: 'avax',
    })
  ).output.map((o) => o.output);

  const rewardRate = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((i) => ({
        target: i,
        params: [GLCR],
      })),
      abi: abiGauge.find((m) => m.name === 'rewardRate'),
      chain: 'avax',
    })
  ).output.map((o) => o.output);

  const tokens = [
    ...new Set(
      metaData
        .map((m) => [m.t0, m.t1])
        .flat()
        .concat(GLCR)
    ),
  ];
  const priceKeys = tokens.map((i) => `avax:${i}`).join(',');

  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  const pools = allPairs.map((p, i) => {
    const poolMeta = metaData[i];

    const r0 = poolMeta.r0 / poolMeta.dec0;
    const r1 = poolMeta.r1 / poolMeta.dec1;
    const re0 = r0 || 0;
    const re1 = r1 || 0;

    const p0 = prices[`avax:${poolMeta.t0}`]?.price;
    const p1 = prices[`avax:${poolMeta.t1}`]?.price;

    const price0 = p0 || 0;
    const price1 = p1 || 0;

    const tvlUsd =
      price0 === 0 && price1 === 0
        ? 0
        : price0 === 0
        ? re1 * price1 * 2
        : price1 === 0
        ? re0 * price0 * 2
        : re0 * price0 + re1 * price1;

    const s = symbols[i];

    const rewardPerSec = (rewardRate[i] / 1e18) * prices[`avax:${GLCR}`]?.price;
    const apyReward = ((rewardPerSec * 86400 * 365) / tvlUsd) * 100;

    return {
      pool: p,
      chain: utils.formatChain('avax'),
      project: 'glacier-exchange-v2',
      symbol: utils.formatSymbol(s.split('-')[1]),
      tvlUsd,
      apyReward,
      rewardTokens: apyReward ? [GLCR] : [],
      underlyingTokens: [poolMeta.t0, poolMeta.t1],
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://glacier.exchange/liquidity',
};
