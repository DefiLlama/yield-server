const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');

const abiPoolFactory = require('./abiPoolFactory.json');
const abiPool = require('./abiPool.json');
const abiVoter = require('./abiVoter.json');
const abiGauge = require('./abiGauge.json');

const PoolFactory = '0xF1046053aa5682b4F9a81b5481394DA16BE5FF5a';
const sinkConverter = '0x585Af0b397AC42dbeF7f18395426BF878634f18D';
const Voter = '0x41C914ee0c7E1A5edCD0295623e6dC557B5aBf3C';
const velo = '0x9560e827aF36c94D2Ac33a39bCE1Fe78631088Db';
const chain = 'optimism';

const apyV2 = async () => {
  const allPoolsLength = (
    await sdk.api.abi.call({
      target: PoolFactory,
      chain,
      abi: abiPoolFactory.find((i) => i.name === 'allPoolsLength'),
    })
  ).output;

  const allPools = (
    await sdk.api.abi.multiCall({
      calls: [...Array(211).keys()].map((i) => ({
        target: PoolFactory,
        params: [i],
      })),
      chain,
      abi: abiPoolFactory.find((i) => i.name === 'allPools'),
    })
  ).output
    .map((o) => o.output)
    .filter((p) => p !== sinkConverter);

  const metadata = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({
        target: i,
      })),
      chain,
      abi: abiPool.find((i) => i.name === 'metadata'),
    })
  ).output.map((o) => o.output);

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
    })
  ).output.map((o) => o.output);

  const uniqueTokens = [...new Set(metadata.map((i) => [i.t0, i.t1]).flat())];
  const priceKeys = uniqueTokens.map((t) => `optimism:${t}`).join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  // for apyBase we sum up fees from `Fees` event
  const topic_name =
    'Fees(index_topic_1 address sender, uint256 amount0, uint256 amount1)';
  const topic0 =
    '0x112c256902bf554b6ed882d2936687aaeb4225e8cd5b51303c90ca6cf43a8602';

  // get block now and offset
  const timeNow = Math.round(Date.now() / 1000);
  const timePrior = timeNow - 86400;
  const [blockNow, blockPrior] = await utils.getBlocksByTime(
    [timeNow, timePrior],
    chain
  );
  const allLogs = await Promise.all(
    allPools.map((p) =>
      sdk.api.util.getLogs({
        target: p,
        topic: topic_name,
        fromBlock: blockPrior,
        toBlock: blockNow,
        keys: [],
        chain,
        topics: [topic0],
      })
    )
  );

  const pools = allPools.map((p, i) => {
    const meta = metadata[i];
    const r0 = meta.r0 / meta.dec0;
    const r1 = meta.r1 / meta.dec1;

    const p0 = prices[`optimism:${meta.t0}`]?.price;
    const p1 = prices[`optimism:${meta.t1}`]?.price;

    const tvlUsd = r0 * p0 + r1 * p1;

    const symbol = symbols[i].split('-')[1];

    const feeUsd24h = allLogs[i].output.reduce((acc, e) => {
      const eventData = e.data;
      const amount0 = parseInt(eventData.slice(0, 66));
      const amount1 = parseInt(`0x${eventData.slice(66, eventData.length)}`);
      // note, better to ping historical endpoint
      acc += (amount0 / meta.dec0) * p0 + (amount1 / meta.dec1) * p1;
      return acc;
    }, 0);

    const apyBase = ((feeUsd24h * 365) / tvlUsd) * 100;

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
      project: 'velodrome',
      symbol: utils.formatSymbol(symbol),
      tvlUsd,
      apyBase,
      apyReward,
      rewardTokens: apyReward > 0 ? [velo] : [],
      poolMeta,
      url,
    };
  });

  return pools.filter((p) => utils.keepFinite(p));
};

module.exports = apyV2;
