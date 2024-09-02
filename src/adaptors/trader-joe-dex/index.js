const superagent = require('superagent');
const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const abi_masterchef = require('./abi_masterchef');

const url = sdk.graph.modifyEndpoint('9ZjERoA7jGANYNz1YNuFMBt11fK44krveEhzssJTWokM');
const masterchef = '0x4483f0b6e2F5486D06958C20f8C39A7aBe87bf8F';

const JOE_TOKEN = '0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd';

const query = gql`
  {
    pairs(first: 1000, orderBy: trackedReserveAVAX, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
      reserve0
      reserve1
      token0 {
        symbol
        id
      }
      token1 {
        symbol
        id
      }
    }
  }
`;

const queryPrior = gql`
  {
    pairs (first: 1000 orderBy: trackedReserveAVAX orderDirection: desc block: {number: <PLACEHOLDER>}) { 
      id 
      volumeUSD 
    }
  }
`;

const buildPool = (entry, chainString) => {
  const apyFee = Number(entry.apy1d);
  const apyJoe = isNaN(entry.apyJoe) ? null : entry.apyJoe;
  const symbol = utils.formatSymbol(
    `${entry.token0.symbol}-${entry.token1.symbol}`
  );
  const newObj = {
    pool: entry.id,
    chain: utils.formatChain(chainString),
    project: 'trader-joe-dex',
    symbol,
    tvlUsd: entry.totalValueLockedUSD,
    apyBase: apyFee,
    apyReward: apyJoe,
    rewardTokens: apyJoe > 0 ? [JOE_TOKEN] : [],
    underlyingTokens: [entry.token0.id, entry.token1.id],
    apyBase7d: entry.apy7d,
    volumeUsd1d: entry.volumeUSD1d,
    volumeUsd7d: entry.volumeUSD7d,
  };

  return newObj;
};

const topLvl = async (chainString, timestamp, url) => {
  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
    url,
  ]);

  const [_, blockPrior7d] = await utils.getBlocks(
    chainString,
    timestamp,
    [url],
    604800
  );

  // pull data
  let dataNow = await request(url, query.replace('<PLACEHOLDER>', block));

  // pull 24h offset data to calculate fees from swap volume
  const dataPrior = await request(
    url,
    queryPrior.replace('<PLACEHOLDER>', blockPrior)
  );

  // 7d offset
  const dataPrior7d = (
    await request(url, queryPrior.replace('<PLACEHOLDER>', blockPrior7d))
  ).pairs;

  // calculate tvl
  dataNow = await utils.tvl(dataNow.pairs, 'avax');

  // calculate apy
  let data = dataNow.map((el) =>
    utils.apy(el, dataPrior.pairs, dataPrior7d, 'v2')
  );

  // prepare LM rewards
  const joePerSec = (
    await sdk.api.abi.call({
      target: masterchef,
      chain: 'avax',
      abi: abi_masterchef.find((n) => n.name === 'joePerSec'),
    })
  ).output;

  const totalAllocPoint = (
    await sdk.api.abi.call({
      target: masterchef,
      chain: 'avax',
      abi: abi_masterchef.find((n) => n.name === 'totalAllocPoint'),
    })
  ).output;

  const poolsLength = (
    await sdk.api.abi.call({
      target: masterchef,
      chain: 'avax',
      abi: abi_masterchef.find((n) => n.name === 'poolLength'),
    })
  ).output;

  let poolInfo = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(poolsLength)).keys()].map((idx) => ({
        params: idx,
        target: masterchef,
      })),
      abi: abi_masterchef.find((n) => n.name === 'poolInfo'),
      chain: 'avax',
    })
  ).output.map(({ output }) => output);

  // get joe price
  const key = 'avax:0x6e84a6216ea6dacc71ee8e6b0a5b7322eebc0fdd';
  const joeUsd = (
    await superagent.get(`https://coins.llama.fi/prices/current/${key}`)
  ).body.coins;

  const dataLM = {};
  for (const p of poolInfo) {
    const relPoolShare = Number(p.allocPoint) / Number(totalAllocPoint);
    // LPs receive 50% of rewards, so we divide by 2
    const rewardPerSecond = (relPoolShare * Number(joePerSec)) / 1e18 / 2;
    const rewardPerDay = rewardPerSecond * 86400;

    dataLM[p.lpToken.toLowerCase()] = {
      joePerYearUsd: rewardPerDay * 365 * joeUsd,
    };
  }

  data = data.map((p) => ({
    ...p,
    apyJoe:
      (dataLM[p.id.toLowerCase()]?.joePerYearUsd /
        Number(p.totalValueLockedUSD)) *
      100,
  }));
  // build pool objects
  data = data.map((el) => buildPool(el, chainString));

  return data;
};

const main = async (timestamp = null) => {
  const data = await Promise.all([topLvl('avalanche', timestamp, url)]);
  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://traderjoexyz.com/pool',
};
