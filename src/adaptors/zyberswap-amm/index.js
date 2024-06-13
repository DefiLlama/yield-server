const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const masterchefAbi = require('./masterchef');
const axios = require('axios');

const masterchef = '0x9BA666165867E916Ee7Ed3a3aE6C19415C2fBDDD';
const ZYB = '0x3B475F6f2f41853706afc9Fa6a6b8C5dF1a2724c';

const utils = require('../utils');

const url = sdk.graph.modifyEndpoint('3g83GYhbyHtjy581vpTmN1AP9cB9MjWMh5TiuNpvTU4R');

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

const topLvl = async (chainString, timestamp, url) => {
  // rewards
  const poolLength = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: masterchefAbi.find((m) => m.name === 'poolLength'),
      chain: chainString,
    })
  ).output;

  const poolInfo = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(poolLength)).keys()].map((i) => ({
        target: masterchef,
        params: [i],
      })),
      abi: masterchefAbi.find((m) => m.name === 'poolInfo'),
      chain: chainString,
    })
  ).output.map((o) => o.output);

  const totalAllocPoint = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: masterchefAbi.find((m) => m.name === 'totalAllocPoint'),
      chain: chainString,
    })
  ).output;

  const zyberPerSec =
    (
      await sdk.api.abi.call({
        target: masterchef,
        abi: masterchefAbi.find((m) => m.name === 'zyberPerSec'),
        chain: chainString,
      })
    ).output / 1e18;

  const priceKey = `arbitrum:${ZYB}`;
  const zyberPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  const zyberPerYearUsd = zyberPerSec * 86400 * 365 * zyberPrice;

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
  data = data.map((el) => utils.apy(el, dataPrior, dataPrior7d, 'zyberswap'));

  // build pool objects
  data = data.map((p) => {
    const x = poolInfo.find(
      (pi) => pi.lpToken.toLowerCase() === p.id.toLowerCase()
    )?.allocPoint;

    const apyReward =
      (((x / totalAllocPoint) * zyberPerYearUsd) / p.totalValueLockedUSD) * 100;

    const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'zyberswap-amm',
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: p.apy1d,
      apyBase7d: p.apy7d,
      apyReward,
      underlyingTokens: [p.token0.id, p.token1.id],
      rewardTokens: apyReward > 0 ? [ZYB] : [],
      volumeUsd1d: p.volumeUSD1d,
      volumeUsd7d: p.volumeUSD7d,
    };
  });

  return data;
};

const main = async (timestamp = null) => {
  const data = await Promise.all([topLvl('arbitrum', timestamp, url)]);
  return data.flat().filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: true,
  apy: main,
  url: 'https://app.zyberswap.io/exchange/pool',
};
