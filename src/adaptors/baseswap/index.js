const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const masterchefAbi = require('./masterchef');
const axios = require('axios');
const BigNumber = require('bignumber.js');

const masterchef = '0x2B0A43DCcBD7d42c18F6A83F86D1a19fA58d541A';
const BSWAP = '0x78a087d713be963bf307b18f2ff8122ef9a63ae9';
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

const queryBswapPrice = gql`
  {
    token(id: "<PLACEHOLDER>") {
      derivedETH
    }
  }
`

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
        params: [i]
      })),
      abi: masterchefAbi.find((m) => m.name === 'poolInfo'),
      chain: chainString,
    })
  ).output.map((o) => o.output);

  const bswapTotalAllocPoint = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: masterchefAbi.find((m) => m.name === 'totalAllocPoint'),
      chain: chainString,
    })
  ).output;

  const bswapPerSec = (
    await sdk.api.abi.call({
      target: masterchef,
      abi: masterchefAbi.find((m) => m.name === 'bswapPerSec'),
      chain: chainString,
    })
  ).output / 1e18;

  // const bswapPriceKey = `base:${BSWAP}`;
  // const bswapPrice = (
  //   await axios.get(`https://coins.llama.fi/prices/current/${bswapPriceKey}`)
  // ).data.coins[bswapPriceKey]?.price;

  const wethPriceKey = `base:${WETH}`;
  const wethPrice = (
    await axios.get(`https://coins.llama.fi/prices/current/${wethPriceKey}`)
  ).data.coins[wethPriceKey]?.price;

  let queryBswapPriceC = queryBswapPrice;
  let bswapPrice = await request(url, queryBswapPriceC.replace('<PLACEHOLDER>', BSWAP));
  bswapPrice = bswapPrice.token.derivedETH * wethPrice;

  const bswapPerYearUsd = bswapPerSec * 86400 * 365 * bswapPrice;

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

    const bswapAllocPoint = poolInfo.find(
      (pid) => pid.lpToken.toLowerCase() === p.id?.toLowerCase()
    )?.allocPoint;

    let totalDeposit = poolInfo.find(
      (pid) => pid.lpToken.toLowerCase() === p.id?.toLowerCase()
    )?.totalDeposit;
    totalDeposit = (new BigNumber(totalDeposit)).dividedBy((new BigNumber(10)).pow(18)).toFixed(18);
    const ratio = totalDeposit / p.totalSupply || 1;

    const bswapApyReward =
      (((bswapAllocPoint / bswapTotalAllocPoint) * bswapPerYearUsd) / (p.totalValueLockedUSD * ratio)) * 100;

    const apyReward = bswapApyReward || 0;

    return {
      pool: p.id,
      chain: utils.formatChain(chainString),
      project: 'baseswap',
      symbol,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: 0,
      apyBase7d: 0,
      apyReward,
      rewardTokens: apyReward > 0 ? [BSWAP] : [],
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
  let data = await topLvl('base', url, query, queryPrior, 'v2', timestamp);

  return data.filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
};
