const sdk = require('@defillama/sdk');
const axios = require('axios');
const { request, gql } = require('graphql-request');
const utils = require('../utils');

const abiPool = require('./abiPool.json');
const abiGauge = require('./abiGauge.json');
const abiVoter = require('./abiVoter.json');
const abiPoolsFactory = require('./abiPoolsFactory.json');

const poolsFactory = '0x420DD381b31aEf6683db6B902084cB0FFECe40Da';
const voter = '0x16613524e02ad97eDfeF371bC883F2F5d6C480A5';
const AERO = '0x940181a94A35A4569E4529A3CDfB74e38FD98631';

const PROJECT = 'aerodrome-v1';
const CHAIN = 'base';
const SUBGRAPH = sdk.graph.modifyEndpoint('7uEwiKmfbRQqV8Ec9nvdKrMFVFQv5qaM271gdBvHtywj');

const query = gql`
  {
    pairs(first: 1000, orderBy: reserveUSD, orderDirection: desc, block: {number: <PLACEHOLDER>}) {
      id
      reserve0
      reserve1
      volumeUSD
      feeTier: token0Fee
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
    pairs (first: 1000 orderBy: reserveUSD orderDirection: desc, block: {number: <PLACEHOLDER>}) { 
      id 
      volumeUSD 
    }
  }
`;

async function getPoolVolumes(timestamp = null) {
  const [block, blockPrior] = await utils.getBlocks(CHAIN, timestamp, [
    SUBGRAPH,
  ]);

  const [_, blockPrior7d] = await utils.getBlocks(
    CHAIN,
    timestamp,
    [SUBGRAPH],
    604800
  );

  // pull data
  let dataNow = await request(SUBGRAPH, query.replace('<PLACEHOLDER>', block));
  dataNow = dataNow.pairs;

  // pull 24h offset data to calculate fees from swap volume
  let queryPriorC = queryPrior;
  let dataPrior = await request(
    SUBGRAPH,
    queryPriorC.replace('<PLACEHOLDER>', blockPrior)
  );
  dataPrior = dataPrior.pairs;

  // 7d offset
  const dataPrior7d = (
    await request(SUBGRAPH, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d))
  ).pairs;

  // calculate tvl
  dataNow = await utils.tvl(dataNow, CHAIN);
  // calculate apy
  dataNow = dataNow.map((el) => utils.apy(el, dataPrior, dataPrior7d, 'v3'));

  const pools = {}
  for (const p of dataNow.filter(p => p.volumeUSD1d >= 0 && (!isNaN(p.apy1d) || !isNaN(p.apy7d)))) {
    const url = 'https://aerodrome.finance/deposit?token0=' + p.token0.id + '&token1=' + p.token1.id + '&factory=0x420DD381b31aEf6683db6B902084cB0FFECe40Da';
    const underlyingTokens = [p.token0.id, p.token1.id];

    const poolAddress = utils.formatAddress(p.id);
    pools[poolAddress] = {
      pool: poolAddress,
      chain: utils.formatChain('base'),
      project: PROJECT,
      symbol: `${p.token0.symbol}-${p.token1.symbol}`,
      tvlUsd: p.totalValueLockedUSD,
      apyBase: p.apy1d,
      apyBase7d: p.apy7d,
      underlyingTokens,
      url,
      volumeUsd1d: p.volumeUSD1d,
      volumeUsd7d: p.volumeUSD7d,
    }
  }

  return pools;
}

const getGaugeApy = async () => {
  const allPoolsLength = (
    await sdk.api.abi.call({
      target: poolsFactory,
      abi: abiPoolsFactory.find((m) => m.name === 'allPoolsLength'),
      chain: CHAIN,
    })
  ).output;

  const allPools = (
    await sdk.api.abi.multiCall({
      calls: [...Array(Number(allPoolsLength)).keys()].map((i) => ({
        target: poolsFactory,
        params: [i],
      })),
      abi: abiPoolsFactory.find((m) => m.name === 'allPools'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const metaData = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({
        target: i,
      })),
      abi: abiPool.find((m) => m.name === 'metadata'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const symbols = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({
        target: i,
      })),
      abi: abiPool.find((m) => m.name === 'symbol'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const gauges = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({
        target: voter,
        params: [i],
      })),
      abi: abiVoter.find((m) => m.name === 'gauges'),
      chain: CHAIN,
    })
  ).output.map((o) => o.output);

  const rewardRate = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((i) => ({
        target: i,
      })),
      abi: abiGauge.find((m) => m.name === 'rewardRate'),
      chain: CHAIN,
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const poolSupply = (
    await sdk.api.abi.multiCall({
      calls: allPools.map((i) => ({ target: i })),
      chain: CHAIN,
      abi: 'erc20:totalSupply',
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const totalSupply = (
    await sdk.api.abi.multiCall({
      calls: gauges.map((i) => ({
        target: i,
      })),
      abi: abiGauge.find((m) => m.name === 'totalSupply'),
      chain: CHAIN,
      permitFailure: true,
    })
  ).output.map((o) => o.output);

  const tokens = [
    ...new Set(
      metaData
        .map((m) => [m.t0, m.t1])
        .flat()
        .concat(AERO)
    ),
  ];

  const maxSize = 50;
  const pages = Math.ceil(tokens.length / maxSize);
  let pricesA = [];
  let x = '';
  for (const p of [...Array(pages).keys()]) {
    x = tokens
      .slice(p * maxSize, maxSize * (p + 1))
      .map((i) => `${CHAIN}:${i}`)
      .join(',')
      .replaceAll('/', '');
    pricesA = [
      ...pricesA,
      (await axios.get(`https://coins.llama.fi/prices/current/${x}`)).data
        .coins,
    ];
  }
  let prices = {};
  for (const p of pricesA.flat()) {
    prices = { ...prices, ...p };
  }

  const pools = allPools.map((p, i) => {
    const poolMeta = metaData[i];
    const r0 = poolMeta.r0 / poolMeta.dec0;
    const r1 = poolMeta.r1 / poolMeta.dec1;

    const p0 = prices[`${CHAIN}:${poolMeta.t0}`]?.price;
    const p1 = prices[`${CHAIN}:${poolMeta.t1}`]?.price;

    const tvlUsd = r0 * p0 + r1 * p1;

    const s = symbols[i];

    const pairPrice = (tvlUsd * 1e18) / totalSupply[i];

    // Only staked supply is eligible for the rewardRate's emissions
    let stakedSupplyRatio = 1;
    if (totalSupply[i] !== 0) {
      stakedSupplyRatio = poolSupply[i] / totalSupply[i];
    }

    const apyReward =
      (((rewardRate[i] / 1e18) * 86400 * 365 * prices[`${CHAIN}:${AERO}`]?.price) /
        tvlUsd) * stakedSupplyRatio *
      100;

    return {
      pool: utils.formatAddress(p),
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: utils.formatSymbol(s.split('-')[1]),
      tvlUsd,
      apyReward,
      rewardTokens: apyReward ? [AERO] : [],
      underlyingTokens: [poolMeta.t0, poolMeta.t1],
      url: `https://aerodrome.finance/deposit?token0=${poolMeta.t0}&token1=${poolMeta.t1}&type=-1&chain0=8453&chain1=8453&factory=0x420DD381b31aEf6683db6B902084cB0FFECe40Da`,
    };
  });

  const poolsApy = {};
  for (const pool of pools.filter((p) => utils.keepFinite(p))) {
    poolsApy[pool.pool] = pool;
  }

  return poolsApy;
};

async function main(timestamp = null) {
  const poolsApy = await getGaugeApy();
  const poolsVolumes = await getPoolVolumes(timestamp);

  // left-join volumes onto APY output to avoid filtering out pools
  return Object.values(poolsApy).map((pool) => {
    const v = poolsVolumes[pool.pool];
    return {
      ...pool,
      apyBase: v?.apyBase,
      apyBase7d: v?.apyBase7d,
      volumeUsd1d: v?.volumeUsd1d,
      volumeUsd7d: v?.volumeUsd7d,
    };
  });
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://aerodrome.finance/liquidity',
};
