const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const masterchefAbi = require('./masterchef');
const axios = require('axios');

const masterchef = '0xd2bcFd6b84E778D2DE5Bb6A167EcBBef5D053A06';
const ARX = '0xD5954c3084a1cCd70B4dA011E67760B8e78aeE84';
const WETH = '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';

const utils = require('../utils');

const url = sdk.graph.modifyEndpoint(
  sdk.graph.modifyEndpoint('DsZsQrDp7VswGGm6PburYZ91AM3E9vwH45nwLCj3kXHA')
);

const query = gql`
  {
    pairs(first: 1000, orderBy: trackedReserveETH, orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      reserve0
      reserve1
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

  const arxTotalAllocPoint = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: masterchefAbi.find((m) => m.name === 'arxTotalAllocPoint'),
      chain: chainString,
    })
  ).output;

  const wethTotalAllocPoint = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: masterchefAbi.find((m) => m.name === 'WETHTotalAllocPoint'),
      chain: chainString,
    })
  ).output;

  const arxPerSec =
    (
      await sdk.api.abi.call({
        target: masterchef,
        abi: masterchefAbi.find((m) => m.name === 'arxPerSec'),
        chain: chainString,
      })
    ).output / 1e18;

  const wethPerSec =
    (
      await sdk.api.abi.call({
        target: masterchef,
        abi: masterchefAbi.find((m) => m.name === 'WETHPerSec'),
        chain: chainString,
      })
    ).output / 1e18;

  const arxPriceKey = `arbitrum:${ARX}`;
  const arxPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${arxPriceKey}`)
  ).data.coins[arxPriceKey]?.price;

  const wethPriceKey = `ethereum:${WETH}`;
  const wethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${wethPriceKey}`)
  ).data.coins[wethPriceKey]?.price;

  const arxPerYearUsd = arxPerSec * 86400 * 365 * arxPrice;
  const wethPerYearUsd = wethPerSec * 86400 * 365 * wethPrice;

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

  return dataNow.map((p) => {
    const symbol = utils.formatSymbol(`${p.token0.symbol}-${p.token1.symbol}`);
    const underlyingTokens = [p.token0.id, p.token1.id];
    const token0 = underlyingTokens === undefined ? '' : underlyingTokens[0];
    const token1 = underlyingTokens === undefined ? '' : underlyingTokens[1];
    const chain = chainString;
    const url = `https://arbidex.fi/add/${token0}/${token1}/`;

    const arxAllocPoint = poolInfo.find(
      (pid) => pid.lpToken.toLowerCase() === p.id?.toLowerCase()
    )?.arxAllocPoint;

    const wethAllocPoint = poolInfo.find(
      (pid) => pid.lpToken.toLowerCase() === p.id?.toLowerCase()
    )?.WETHAllocPoint;

    const arxApyReward =
      (((arxAllocPoint / arxTotalAllocPoint) * arxPerYearUsd) /
        p.totalValueLockedUSD) *
      100;

    const wethApyReward =
      (((wethAllocPoint / wethTotalAllocPoint) * wethPerYearUsd) /
        p.totalValueLockedUSD) *
      100;

    const apyReward = arxApyReward + wethApyReward;

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'arbitrum-exchange-v2',
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: p.apy1d,
      apyBase7d: p.apy7d,
      apyReward,
      rewardTokens: apyReward > 0 ? [WETH, ARX] : [],
      underlyingTokens,
      url,
      volumeUsd1d: p.volumeUSD1d,
      volumeUsd7d: p.volumeUSD7d,
    };
  });
};

const main = async (timestamp = null) => {
  let data = await topLvl(
    'arbitrum',
    url,
    query,
    queryPrior,
    'arbidex',
    timestamp
  );

  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
