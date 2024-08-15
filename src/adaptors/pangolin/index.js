const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const axios = require('axios');

const utils = require('../utils');
const minichefAbi = require('./minichefAbi');

const url = sdk.graph.modifyEndpoint('7PRKughAkeESafrGZ8A2x1YsbNMQnFbxQ1bpeNjktwZk');
const minichef = '0x1f806f7C8dED893fd3caE279191ad7Aa3798E928';
const PNG = '0x60781c2586d68229fde47564546784ab3faca982';

const query = gql`
  {
    pairs(first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
      reserve0
      reserve1
      token0 {
        id
        symbol
      }
      token1 {
        id
        symbol
      }
    }
  }
`;

const queryPrior = gql`
  {
    pairs(first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id 
      volumeUSD 
    }
  }
`;

const buildPool = (entry, chainString) => {
  const symbol = utils.formatSymbol(
    `${entry.token0.symbol}-${entry.token1.symbol}`
  );
  const newObj = {
    pool: entry.id,
    chain: utils.formatChain(chainString),
    project: 'pangolin',
    symbol,
    tvlUsd: entry.totalValueLockedUSD,
    apyBase: entry.apy1d,
    apyBase7d: entry.apy7d,
    underlyingTokens: [entry.token0.id, entry.token1.id],
    volumeUsd1d: entry.volumeUSD1d,
    volumeUsd7d: entry.volumeUSD7d,
  };

  return newObj;
};

const topLvl = async (chainString, timestamp, url, version) => {
  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
    url,
  ]);

  const [_, blockPrior7d] = await utils.getBlocks(
    chainString,
    timestamp,
    [url],
    604800
  );

  let data = (await request(url, query.replace('<PLACEHOLDER>', block))).pairs;

  // pull 24h offset data to calculate fees from swap volume
  const dataPrior = (
    await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior))
  ).pairs;

  // 7d offset
  const dataPrior7d = (
    await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior7d))
  ).pairs;

  // calculate tvl
  data = await utils.tvl(data, chainString);

  // calculate apy
  data = data.map((el) => utils.apy(el, dataPrior, dataPrior7d, version));

  // build pool objects
  data = data
    .map((el) => buildPool(el, chainString))
    .filter((p) => utils.keepFinite(p));

  return data;
};

const main = async (timestamp = null) => {
  const data = (
    await Promise.all([topLvl('avalanche', timestamp, url, 'v2')])
  ).flat();

  // -- rewards
  const lpTokens = (
    await sdk.api.abi.call({
      target: minichef,
      abi: minichefAbi.find((m) => m.name === 'lpTokens'),
      chain: 'avax',
    })
  ).output;
  let poolInfos = (
    await sdk.api.abi.call({
      target: minichef,
      abi: minichefAbi.find((m) => m.name === 'poolInfos'),
      chain: 'avax',
    })
  ).output;
  poolInfos = poolInfos.map((p, i) => ({ ...p, lpToken: lpTokens[i] }));

  const rewardPerSecond =
    (
      await sdk.api.abi.call({
        target: minichef,
        abi: minichefAbi.find((m) => m.name === 'rewardPerSecond'),
        chain: 'avax',
      })
    ).output / 1e18;

  const priceKey = `avax:${PNG}`;
  const pngPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey].price;
  const pngPerYearUsd = rewardPerSecond * 60 * 60 * 24 * 365 * pngPrice;

  const totalAllocPoint = (
    await sdk.api.abi.call({
      target: minichef,
      abi: minichefAbi.find((m) => m.name === 'totalAllocPoint'),
      chain: 'avax',
    })
  ).output;

  return data.map((p) => {
    const piAllocPoint = poolInfos.find(
      (i) => i.lpToken.toLowerCase() === p.pool.toLowerCase()
    )?.allocPoint;

    return {
      ...p,
      apyReward:
        ((pngPerYearUsd * (piAllocPoint / totalAllocPoint)) / p.tvlUsd) * 100,
      rewardTokens: piAllocPoint > 0 ? [PNG] : [],
    };
  });
};

module.exports = {
  timetravel: true,
  apy: main,
  url: 'https://app.pangolin.exchange/#/pool',
};
