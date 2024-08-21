const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');

const abiPoolFactory = require('../velodrome-v1/abiPoolFactory.json');
const abiPool = require('../velodrome-v1/abiPool.json');
const abiVoter = require('../velodrome-v1/abiVoter.json');
const abiGauge = require('../velodrome-v1/abiGauge.json');

const PoolFactory = '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a';
const sinkConverter = '0x585Af0b397AC42dbeF7f18395426BF878634f18D';
const Voter = '0x41C914ee0c7E1A5edCD0295623e6dC557B5aBf3C';
const velo = '0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db';
const chain = 'optimism';
const project = 'velodrome-v2';

const apy = async () => {
  const allPoolsLength = (
    await sdk.api.abi.call({
      target: PoolFactory,
      chain,
      abi: abiPoolFactory.find((i) => i.name === 'allPoolsLength'),
    })
  ).output;

  const allPools = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(allPoolsLength)).keys()].map((i) => ({
        target: PoolFactory,
        params: [i],
      })),
      chain,
      abi: abiPoolFactory.find((i) => i.name === 'allPools'),
    })
  ).output
    .map((o) => o.output)
    .filter((p) => p !== sinkConverter);

  const poolFees = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({
        target: i,
      })),
      chain,
      abi: abiPool.find((i) => i.name === 'poolFees'),
    })
  ).output.map((o) => o.output);

  const metadata = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({
        target: i,
      })),
      chain,
      abi: abiPool.find((i) => i.name === 'metadata'),
    })
  ).output.map((o) => o.output);

  const feeBalanceNow = await Promise.all(
    poolFees.map((p, i) =>
      sdk.api.abi.multiCall({
        calls: [
          { target: metadata[i].t0, params: poolFees[i] },
          { target: metadata[i].t1, params: poolFees[i] },
        ],
        chain,
        abi: 'erc20:balanceOf',
      })
    )
  );

  const feeStable = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({
        target: PoolFactory,
        params: [i, true],
      })),
      chain,
      abi: abiPoolFactory.find((i) => i.name === 'getFee'),
    })
  ).output.map((o) => o.output);

  const feeVolatile = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({
        target: PoolFactory,
        params: [i, false],
      })),
      chain,
      abi: abiPoolFactory.find((i) => i.name === 'getFee'),
    })
  ).output.map((o) => o.output);

  const symbols = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({ target: i })),
      chain,
      abi: 'erc20:symbol',
    })
  ).output.map((o) => o.output);

  const gauges = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({ target: Voter, params: [i] })),
      chain,
      abi: abiVoter.find((i) => i.name === 'gauges'),
    })
  ).output.map((o) => o.output);

  const rewardRate = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((i) => ({ target: i })),
      chain,
      abi: abiGauge.find((i) => i.name === 'rewardRate'),
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const uniqueTokens = [...new Set(metadata.map((i) => [i.t0, i.t1]).flat())];

  const maxSize = 50;
  const pages = Math.ceil(uniqueTokens.length / maxSize);
  let prices_ = [];
  let x = '';
  for (const p of [...Array(pages).keys()]) {
    x = uniqueTokens
      .slice(p * maxSize, maxSize * (p + 1))
      .map((t) => `optimism:${t}`)
      .join(',');
    prices_ = [
      ...prices_,
      (await axios.get(`https://coins.llama.fi/prices/current/${x}`)).data
        .coins,
    ];
  }
  // flatten
  let prices = {};
  for (const p of prices_.flat()) {
    prices = { ...prices, ...p };
  }

  const pools = allPools.map((p, i) => {
    const meta = metadata[i];
    const r0 = meta.r0 / meta.dec0;
    const r1 = meta.r1 / meta.dec1;

    const p0 = prices[`optimism:${meta.t0}`]?.price;
    const p1 = prices[`optimism:${meta.t1}`]?.price;

    const price0 = p0 || 0;
    const price1 = p1 || 0;

    const tvlUsd =
      price0 === 0 && price1 === 0
        ? 0
        : price0 === 0
        ? r1 * price1 * 2
        : price1 === 0
        ? r0 * price0 * 2
        : r0 * price0 + r1 * price1;

    const symbol = symbols[i].split('-')[1];

    const apyReward =
      (((rewardRate[i] / 1e18) *
        86400 *
        365 *
        prices[`optimism:${velo}`]?.price) /
        tvlUsd) *
      100;

    const feeTier = meta.st
      ? `${feeStable[i] / 100}`
      : `${feeVolatile[i] / 100}`;
    const poolMeta = meta.st
      ? `stable - ${feeTier}%`
      : `volatile - ${feeTier}%`;

    const url =
      `https://app.velodrome.finance/deposit?token0=${meta.t0}&token1=${meta.t1}&stable=${meta.st}`.toLowerCase();

    return {
      pool: p,
      chain: 'Optimism',
      project,
      symbol: utils.formatSymbol(symbol),
      tvlUsd,
      apyReward,
      rewardTokens: apyReward > 0 ? [velo] : [],
      poolMeta,
      url,
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
};
