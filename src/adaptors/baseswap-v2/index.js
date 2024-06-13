const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const masterchefAbi = require('./masterchef');
const nftpoolAbi = require('./nftpool');
const smartchefinitializableAbi = require('./smartchefinitializable');
const anytokenAbi = require('./anytoken');
const axios = require('axios');
const BigNumber = require('bignumber.js');

const masterchef = '0x6fc0f134a1f20976377b259687b1c15a5d422b47';
const BSWAP = '0x78a087d713be963bf307b18f2ff8122ef9a63ae9';
const BSX = '0xd5046b976188eb40f6de40fb527f89c05b323385';
const XBSX = '0xe4750593d1fc8e74b31549212899a72162f315fa';
const WETH = '0x4200000000000000000000000000000000000006';
const USDBC = '0xd9aaec86b65d86f6a7b5b1b0c42ffa531710b6ca';
const EDE = '0x0a074378461fb7ed3300ea638c6cc38246db4434';

const project = 'baseswap-v2';

const symbols = {
  [BSWAP]: 'BSWAP',
  [BSX]: 'BSX',
  [XBSX]: 'XBSX',
  [WETH]: 'WETH',
  [USDBC]: 'USDBC',
};

const staker_contracts = [
  '0x64fcfa940f286af1261107f993189379e8d3ae1c', // BSWAP USDbC
  '0x86dbd5baae91ac576e8e5197eb2497603d0056ea', // BSWAP WETH
  '0x55da9a8a85d37764934a8915621baa00fafdc3eb', // BSX USDbC
  '0x26fd5de668f091222791cc0ea45ac072d7bfe0cd', // BSX WETH
  '0x8d52e213d741684dec1d37a6ee7814ae32942c1e', // BSX EDE
  '0x326929eae4e1923b9d08de6bd8b2e16f7dd35cd4', // xBSX USDbC
];

const utils = require('../utils');

const url = sdk.graph.modifyEndpoint(
  sdk.graph.modifyEndpoint('BWHCfpXMHFDx3u4E14hEwv4ST7SUyN89FKJ2RjzWKgA9')
);

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
  // single staking pools
  stakers = staker_contracts.reduce((hash, elem) => {
    hash[elem] = {};
    return hash;
  }, {});

  const ssStakedTokens = (
    await sdk.api.abi.multiCall({
      calls: [...Object.keys(stakers)].map((i) => ({
        target: i,
      })),
      abi: smartchefinitializableAbi.find((m) => m.name === 'stakedToken'),
      chain: chainString,
    })
  ).output.map((o) => [o.input.target, o.output.toLowerCase()]);
  ssStakedTokens.forEach((e) => (stakers[e[0]]['stakedToken'] = e[1]));

  const ssRewardTokens = (
    await sdk.api.abi.multiCall({
      calls: [...Object.keys(stakers)].map((i) => ({
        target: i,
      })),
      abi: smartchefinitializableAbi.find((m) => m.name === 'rewardToken'),
      chain: chainString,
    })
  ).output.map((o) => [o.input.target, o.output.toLowerCase()]);
  ssRewardTokens.forEach((e) => (stakers[e[0]]['rewardToken'] = e[1]));

  const ssRewardsPerSecond = (
    await sdk.api.abi.multiCall({
      calls: [...Object.keys(stakers)].map((i) => ({
        target: i,
      })),
      abi: smartchefinitializableAbi.find((m) => m.name === 'rewardPerSecond'),
      chain: chainString,
    })
  ).output.map((o) => [o.input.target, o.output.toLowerCase()]);
  ssRewardsPerSecond.forEach((e) => (stakers[e[0]]['rewardPerSecond'] = e[1]));

  const ssBalancesOf = (
    await sdk.api.abi.multiCall({
      calls: [...Object.keys(stakers)].map((i) => ({
        target: stakers[i].stakedToken,
        params: [i],
      })),
      abi: anytokenAbi.find((m) => m.name === 'balanceOf'),
      chain: chainString,
    })
  ).output.map((o) => [o.input.params, o.output]);
  ssBalancesOf.forEach((e) => (stakers[e[0]]['balanceOf'] = e[1]));

  const ssStakedTokensDecimals = (
    await sdk.api.abi.multiCall({
      calls: [...new Set(Object.values(stakers).map((e) => e.stakedToken))].map(
        (i) => ({
          target: i,
        })
      ),
      abi: anytokenAbi.find((m) => m.name === 'decimals'),
      chain: chainString,
    })
  ).output.reduce((hash, elem) => {
    hash[elem.input.target] = elem.output;
    return hash;
  }, {});
  Object.values(stakers).forEach((e) => {
    e.stakedTokenDecimals = ssStakedTokensDecimals[e.stakedToken];
  });

  const ssRewardTokensDecimals = (
    await sdk.api.abi.multiCall({
      calls: [...new Set(Object.values(stakers).map((e) => e.rewardToken))].map(
        (i) => ({
          target: i,
        })
      ),
      abi: anytokenAbi.find((m) => m.name === 'decimals'),
      chain: chainString,
    })
  ).output.reduce((hash, elem) => {
    hash[elem.input.target] = elem.output;
    return hash;
  }, {});
  Object.values(stakers).forEach((e) => {
    e.rewardTokenDecimals = ssRewardTokensDecimals[e.rewardToken];
  });

  // lp farming
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
        params: [i],
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
        target: i,
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

  const wethPriceKey = `base:${WETH}`;
  const wethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${wethPriceKey}`)
  ).data.coins[wethPriceKey]?.price;

  const usdbcPriceKey = `base:${USDBC}`;
  const usdbcPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${usdbcPriceKey}`)
  ).data.coins[usdbcPriceKey]?.price;

  const edePriceKey = `base:${EDE}`;
  const edePrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${edePriceKey}`)
  ).data.coins[edePriceKey]?.price;

  const prices = {
    [BSWAP]: bswapPrice,
    [BSX]: bsxPrice,
    [XBSX]: bsxPrice,
    [WETH]: wethPrice,
    [USDBC]: usdbcPrice,
    [EDE]: edePrice,
  };

  const bswapPerYearUsd = bswapPerSec * 86400 * 365 * bswapPrice;
  const bsxPerYearUsd = bsxPerSec * 86400 * 365 * bsxPrice;

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

    const bswapApyReward =
      (((bswapAllocPoints / bswapTotalAllocPoints) * bswapPerYearUsd) /
        (p.totalValueLockedUSD * ratio)) *
      100;
    const bsxApyReward =
      (((bsxAllocPoints / bsxTotalAllocPoints) * bsxPerYearUsd) /
        (p.totalValueLockedUSD * ratio)) *
      100;

    const apyReward = bswapApyReward + bsxApyReward || 0;

    let rewardTokens = [];
    bswapApyReward > 0 && rewardTokens.push(BSWAP);
    bsxApyReward > 0 && rewardTokens.push(BSX, XBSX);

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project,
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

  Object.entries(stakers).forEach(([key, val]) => {
    balanceUSD =
      (val.balanceOf / Math.pow(10, val.stakedTokenDecimals)) *
      prices[val.stakedToken];
    rewardPerSecond =
      val.rewardPerSecond / Math.pow(10, val.rewardTokenDecimals);
    rewardAPR =
      (rewardPerSecond * 86400 * 365 * prices[val.rewardToken]) / balanceUSD;
    dataNow.push({
      pool: key,
      chain: utils.formatChain(chainString),
      project,
      symbol: symbols[val.stakedToken],
      tvlUsd: balanceUSD,
      apyBase: 0,
      apyReward: rewardAPR * 100,
      rewardTokens: [val.rewardToken],
      underlyingTokens: [val.stakedToken],
      url: 'https://baseswap.fi/pools',
    });
  });

  return dataNow;
};

const main = async (timestamp = null) => {
  let data = await topLvl(
    'base',
    url,
    query,
    queryPrior,
    'baseswap',
    timestamp
  );

  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
