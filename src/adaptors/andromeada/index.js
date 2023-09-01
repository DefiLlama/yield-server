const sdk = require('@defillama/sdk4');
const axios = require('axios');

const utils = require('../utils');

const abiVoter = require('../velodrome-v1/abiVoter.json');
const abis = require('./abis');

const PoolFactory = '0xB9e611CaD79f350929C8E36cAbbe5D2Ce9502D51';
const Voter = '0xf36B02Eb3fb999775a91d8b6Edb507798f52c887';
const andre = '0xFA7D088f6B1bbf7b1C8c3aC265Bb797264FD360B';
const andreOracle = '0x8a346de1b1d920439a30B19b4DF07F5D24f6033D';
const chain = 'base';
const project = 'andromeada';

const apy = async () => {
  const allPoolsLength = (
    await sdk.api.abi.call({
      target: PoolFactory,
      chain,
      abi: abis.allPairsLength,
    })
  ).output;

  const allPools = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(allPoolsLength)).keys()].map((i) => ({
        target: PoolFactory,
        params: [i],
      })),
      chain,
      abi: abis.allPools,
    })
  ).output.map((o) => o.output);

  const reserves = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({ target: i })),
      chain,
      abi: abis.getReserves,
    })
  ).output.map((o) => o.output);

  const token0s = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({ target: i })),
      chain,
      abi: abis.token0,
    })
  ).output.map((o) => o.output);

  const token1s = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({ target: i })),
      chain,
      abi: abis.token1,
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
      calls: gauges.map((i) => ({ target: i, params: [andre] })),
      chain,
      abi: abis.rewardRate,
    })
  ).output.map((o) => Number(o.output) || 0);

  const andreOraclePrice = (
    await sdk.api.abi.multiCall({
      calls: [{ target: andreOracle }],
      chain,
      abi: abis.chainlinkLatestAnswer,
    })
  ).output.map((o) => o.output * 1e4);

  const uniqueTokens = [...new Set([...token0s, ...token1s]).values()];

  const maxSize = 50;
  const pages = Math.ceil(uniqueTokens.length / maxSize);
  let prices_ = [];
  let x = '';

  for (const p of [...Array(pages).keys()]) {
    x = uniqueTokens
      .slice(p * maxSize, maxSize * (p + 1))
      .map((t) => `base:${t}`)
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

  prices[`base:${andre}`] = {
    decimals: 18,
    price: Number(andreOraclePrice[0]),
  };

  const pools = allPools.map((p, i) => {
    const meta = reserves[i];

    const t0 = token0s[i];
    const t1 = token1s[i];

    const p0 = prices[`base:${t0}`];
    const p1 = prices[`base:${t1}`];

    if (!p0 || !p1) return;

    const r0 = meta._reserve0 / 10 ** p0.decimals;
    const r1 = meta._reserve1 / 10 ** p1.decimals;

    const price0 = p0.price || 0;
    const price1 = p1.price || 0;

    const tvlUsd =
      price0 === 0 && price1 === 0
        ? 0
        : price0 === 0
        ? r1 * price1 * 2
        : price1 === 0
        ? r0 * price0 * 2
        : r0 * price0 + r1 * price1;

    const symbol = `${p0.symbol}-${p1.symbol}`;

    const price = prices[`base:${andre}`]?.price;
    const rewardUSD = (rewardRate[i] * 86400 * 365 * price) / 1e18;

    const apyReward = (rewardUSD / tvlUsd) * 100;

    return {
      pool: p,
      chain: 'base',
      project,
      symbol: utils.formatSymbol(symbol),
      tvlUsd,
      apyReward,
      rewardTokens: apyReward > 0 ? [andre] : [],
      // poolMeta,
      url: `https://andromeada.com/liquidity`,
    };
  });

  return pools.filter((p) => !!p).filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: `https://andromeada.com/liquidity`,
};
