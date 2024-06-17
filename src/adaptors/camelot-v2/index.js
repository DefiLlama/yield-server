const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const masterchefAbi = require('./masterchef');
const stakingPositionAbi = require('./stakingPosition');
const factoryAbi = require('./factory');
const lp = require('./lp');
const lpAbi = require('./lp');
const axios = require('axios');

const masterchef = '0x55401A4F396b3655f66bf6948A1A4DC61Dfc21f4';
const factory = '0x6EcCab422D763aC031210895C81787E87B43A652';
const GRAIL = '0x3d9907f9a368ad0a51be60f7da3b97cf940982d8';

const utils = require('../utils');

const url = sdk.graph.modifyEndpoint(
  '8zagLSufxk5cVhzkzai3tyABwJh53zxn9tmUYJcJxijG'
);

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
  // --- fee tier
  const allPairsLength = (
    await sdk.api.abi.call({
      target: factory,
      abi: factoryAbi.find((m) => m.name === 'allPairsLength'),
      chain: chainString,
    })
  ).output;

  const allPairs = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(allPairsLength)).keys()].map((i) => ({
        target: factory,
        params: [i],
      })),
      abi: factoryAbi.find((m) => m.name === 'allPairs'),
      chain: chainString,
    })
  ).output.map((o) => o.output);

  const token0FeePercent = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: i,
      })),
      abi: lpAbi.find((m) => m.name === 'token0FeePercent'),
      chain: chainString,
    })
  ).output.map((o) => o.output);

  const token1FeePercent = (
    await sdk.api.abi.multiCall({
      calls: allPairs.map((i) => ({
        target: i,
      })),
      abi: lpAbi.find((m) => m.name === 'token1FeePercent'),
      chain: chainString,
    })
  ).output.map((o) => o.output);

  // --- rewards
  const poolsLength = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: masterchefAbi.find((m) => m.name === 'poolsLength'),
      chain: chainString,
    })
  ).output;

  const pools = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(poolsLength)).keys()].map((i) => ({
        target: masterchef,
        params: [i],
      })),
      abi: masterchefAbi.find((m) => m.name === 'getPoolAddressByIndex'),
      chain: chainString,
    })
  ).output.map((o) => o.output);

  let poolInfo = (
    await sdk.api.abi.multiCall({
      calls: pools.map((i) => ({
        target: i,
      })),
      abi: stakingPositionAbi.find((m) => m.name === 'getPoolInfo'),
      chain: chainString,
    })
  ).output.map((o) => o.output);

  const lpTokens = poolInfo.map((p) => p.lpToken);
  const totalSupply = (
    await sdk.api.abi.multiCall({
      calls: lpTokens.map((i) => ({
        target: i,
      })),
      abi: lp.find((m) => m.name === 'totalSupply'),
      chain: chainString,
    })
  ).output.map((o) => o.output);

  poolInfo = poolInfo.map((p, i) => ({ ...p, totalSupply: totalSupply[i] }));

  const totalAllocPoint = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: masterchefAbi.find((m) => m.name === 'totalAllocPoint'),
      chain: chainString,
    })
  ).output;

  const grailPerSec =
    (
      await sdk.api.abi.call({
        target: masterchef,
        abi: masterchefAbi.find((m) => m.name === 'emissionRate'),
        chain: chainString,
      })
    ).output / 1e18;

  const priceKey = `arbitrum:${GRAIL}`;
  const grailPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
  ).data.coins[priceKey]?.price;

  const grailPerYearUsd = grailPerSec * 86400 * 365 * grailPrice;

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

  // add fee tier
  data = data.map((p) => {
    const idx = allPairs.findIndex(
      (i) => i.toLowerCase() === p.id.toLowerCase()
    );
    const feeAvg =
      ((Number(token0FeePercent[idx]) + Number(token1FeePercent[idx])) / 2) *
      10;
    return { ...p, feeTier: feeAvg };
  });

  // calculate apy
  data = data.map((el) => utils.apy(el, dataPrior, dataPrior7d, 'v3'));

  // build pool objects
  data = data.map((p) => {
    const pi = poolInfo.find(
      (pi) => pi.lpToken.toLowerCase() === p.id?.toLowerCase()
    );

    const farmReserveRatio = pi?.lpSupplyWithMultiplier / pi?.totalSupply;

    const apyReward =
      (((pi?.allocPoint / totalAllocPoint) * grailPerYearUsd) /
        (p.totalValueLockedUSD * farmReserveRatio)) *
      100;

    // rewards are 20% in liquid grail and 80% in non-transferable xgrail (which can be used to boost though)
    // gonna report 20% grail only

    const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'camelot-v2',
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: p.apy1d,
      apyBase7d: p.apy7d,
      apyReward: apyReward * 0.2,
      underlyingTokens: [p.token0.id, p.token1.id],
      rewardTokens: apyReward > 0 ? [GRAIL] : [],
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
  url: 'https://app.camelot.exchange/liquidity',
};
