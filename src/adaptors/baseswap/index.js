const sdk = require('@defillama/sdk4');
const { request, gql } = require('graphql-request');
const masterchefAbi = require('./masterchef');
const nftpoolAbi = require('./nftpool');
const axios = require('axios');
const BigNumber = require('bignumber.js');

const masterchef = '0x6fc0f134a1f20976377b259687b1c15a5d422b47';
const BSWAP = '0x78a087d713be963bf307b18f2ff8122ef9a63ae9';
const BSX = '0xd5046b976188eb40f6de40fb527f89c05b323385';
const WETH = '0x4200000000000000000000000000000000000006';

const utils = require('../utils');

const url = 'https://api.thegraph.com/subgraphs/name/harleen-m/baseswap';

const query = gql`
  {
    pairs(first: 1000, orderBy: trackedReserveETH, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      reserve0
      reserve1
      totalSupply
      volumeUSD
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
    pairs (first: 1000 orderBy: trackedReserveETH orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
    }
  }
`;

const topLvl = async (
  chainString,
  url,
  query,
  queryPrior,
  version,
  timestamp
) => {
  const activePoolsLength = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: masterchefAbi.find((m) => m.name === 'activePoolsLength'),
      chain: chainString,
    })
  ).output;

  const activePoolAddressesByIndex = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(activePoolsLength)).keys()].map((i) => ({
        target: masterchef,
        params: [i]
      })),
      abi: masterchefAbi.find((m) => m.name === 'getActivePoolAddressByIndex'),
      chain: chainString,
    })
  ).output.map((o) => o.output);

  // const poolInfos = (
  //   await sdk.api.abi.multiCall({
  //     calls: [...activePoolAddressesByIndex].map((i) => ({
  //       target: masterchef,
  //       params: [i]
  //     })),
  //     abi: masterchefAbi.find((m) => m.name === 'getPoolInfo'),
  //     chain: chainString,
  //   })
  // ).output.map((o) => o.output);

  const poolInfos = (
    await sdk.api.abi.multiCall({
      calls: [...activePoolAddressesByIndex].map((i) => ({
        target: i
      })),
      abi: nftpoolAbi.find((m) => m.name === 'getPoolInfo'),
      chain: chainString,
    })
  ).output.map((o) => o.output);

  const bswapTotalAllocPoints = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: masterchefAbi.find((m) => m.name === 'totalAllocPointsWETH'),
      chain: chainString,
    })
  ).output;

  const bsxTotalAllocPoints = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: masterchefAbi.find((m) => m.name === 'totalAllocPoints'),
      chain: chainString,
    })
  ).output;

  const emissionRates = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: masterchefAbi.find((m) => m.name === 'emissionRates'),
      chain: chainString,
    })
  ).output;

  const bswapPerSec = emissionRates['wethRate'] / 1e18;
  const bsxPerSec = emissionRates['mainRate'] / 1e18;

  const bswapPriceKey = `base:${BSWAP}`;
  const bswapPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${bswapPriceKey}`)
  ).data.coins[bswapPriceKey]?.price;

  const bsxPriceKey = `base:${BSX}`;
  const bsxPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${bsxPriceKey}`)
  ).data.coins[bsxPriceKey]?.price;

  // const wethPriceKey = `base:${WETH}`;
  // const wethPrice = (
  //   await axios.get(`https://coins.llama.fi/prices/current/${wethPriceKey}`)
  // ).data.coins[wethPriceKey]?.price;

  const bswapPerYearUsd = bswapPerSec * 86400 * 365 * bswapPrice;
  const bsxPerYearUsd = bsxPerSec * 86400 * 365 * bsxPrice;

  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [url]);

  const [_, blockPrior7d] = await utils.getBlocks(
    chainString,
    timestamp,
    [url],
    604800
  );

  // pull data
  let queryC = query;
  let dataNow = await request(url, queryC.replace('<PLACEHOLDER>', block));
  dataNow = dataNow.pairs;

  // pull 24h offset data to calculate fees from swap volume
  let queryPriorC = queryPrior;
  let dataPrior = await request(
    url,
    queryPriorC.replace('<PLACEHOLDER>', blockPrior)
  );
  dataPrior = dataPrior.pairs;

  // 7d offset
  const dataPrior7d = (
    await request(url, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d))
  ).pairs;

  // calculate tvl
  dataNow = await utils.tvl(dataNow, chainString);
  // calculate apy
  dataNow = dataNow.map((el) => utils.apy(el, dataPrior, dataPrior7d, version));

  dataNow = dataNow.map((p) => {
    const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    const underlyingTokens = [p.token0.id, p.token1.id];
    const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
    const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
    const chain = chainString;
    const url = `https://baseswap.fi/add/${token0}/${token1}`;

    const bswapAllocPoints = poolInfos.find(
      (pid) => pid.lpToken.toLowerCase() === p.id?.toLowerCase()
    )?.allocPointsWETH;

    const bsxAllocPoints = poolInfos.find(
      (pid) => pid.lpToken.toLowerCase() === p.id?.toLowerCase()
    )?.allocPoints;

    let lpSupply = poolInfos.find(
      (pid) => pid.lpToken.toLowerCase() === p.id?.toLowerCase()
    )?.lpSupply;
    lpSupply = lpSupply / 1e18;
    const ratio = lpSupply / p.totalSupply || 1;

    const bswapApyReward = (((bswapAllocPoints / bswapTotalAllocPoints) * bswapPerYearUsd) / (p.totalValueLockedUSD * ratio)) * 100;
    const bsxApyReward = (((bsxAllocPoints / bsxTotalAllocPoints) * bsxPerYearUsd) / (p.totalValueLockedUSD * ratio)) * 100;

    const apyReward = (bswapApyReward + bsxApyReward) || 0;

    let rewardTokens = [];
    bswapApyReward > 0 && rewardTokens.push('BSWAP');
    bsxApyReward > 0 && rewardTokens.push('BSX', 'XBSX');

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'baseswap',
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: p.apy1d,
      apyBase7d: p.apy7d,
      apyReward,
      rewardTokens,
      underlyingTokens,
      url,
      volumeUsd1d: p.volumeUSD1d,
      volumeUsd7d: p.volumeUSD7d,
    };
  });

  // return only pools with apyReward > 0
  dataNow = dataNow.filter((el) => el.apyReward > 0);

  return dataNow;
};

const main = async (timestamp = null) => {
  let data = await topLvl('base', url, query, queryPrior, 'baseswap', timestamp);

  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
