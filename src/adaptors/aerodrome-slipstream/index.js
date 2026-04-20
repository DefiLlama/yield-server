const sdk = require('@defillama/sdk');
const axios = require('axios');
const { request, gql } = require('graphql-request');
const utils = require('../utils');

const abiSugar = require('./abiSugar.json');
const abiSugarHelper = require('./abiSugarHelper.json');
const { pool } = require('../rocifi-v2/abi');

const AERO = '0x940181a94A35A4569E4529A3CDfB74e38FD98631';
const sugar = '0x92294D631E995f1dd9CeE4097426e6a71aB87Bcf';
const sugarHelper = '0x6d2D739bf37dFd93D804523c2dfA948EAf32f8E1';
const nullAddress = '0x0000000000000000000000000000000000000000';
const PROJECT = 'aerodrome-slipstream';
const CHAIN = 'base';
const WEEK = 604800;
const SUBGRAPH = sdk.graph.modifyEndpoint('GENunSHWLBXm59mBSgPzQ8metBEp9YDfdqwFr91Av1UM');

const tickWidthMappings = {1: 5, 50: 5, 100: 15, 200: 10, 2000: 2};

// Fetch gauge fees for all CL pools at a historical block, keyed by lp address.
// Reuses the shared pagination helper defined below.
async function fetchPoolFeesAtBlock(blockNumber) {
  const raw = await paginatePools(blockNumber);
  const fees = {};
  for (const p of raw.filter((t) => Number(t.type) > 0 && t.gauge != nullAddress)) {
    fees[p.lp.toLowerCase()] = {
      token0_fees: p.token0_fees,
      token1_fees: p.token1_fees,
      liquidity: p.liquidity,
      gauge_liquidity: p.gauge_liquidity,
    };
  }
  return fees;
}

const query = gql`
{
  pools(first: 1000, orderBy: totalValueLockedUSD, orderDirection: desc, block: {number: <PLACEHOLDER>}) {
    id
    reserve0: totalValueLockedToken0
    reserve1: totalValueLockedToken1
    volumeUSD
    volumeToken0
    feeTier
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
  pools(first: 1000 orderBy: totalValueLockedUSD orderDirection: desc, block: {number: <PLACEHOLDER>}) { 
    id 
    volumeUSD
    volumeToken0
  }
}
`;

async function getPoolVolumes(timestamp = null) {
  let [block, blockPrior] = await utils.getBlocks(CHAIN, timestamp, [
    SUBGRAPH,
  ]);
  // buffer so data indexers behind the _meta endpoint can still serve the query
  block -= 100;

  const [_, blockPrior7d] = await utils.getBlocks(
    CHAIN,
    timestamp,
    [SUBGRAPH],
    604800
  );

  // pull data
  let dataNow = await request(SUBGRAPH, query.replace('<PLACEHOLDER>', block));
  dataNow = dataNow.pools;

  // pull 24h offset data to calculate fees from swap volume
  let queryPriorC = queryPrior;
  let dataPrior = await request(
    SUBGRAPH,
    queryPriorC.replace('<PLACEHOLDER>', blockPrior)
  );
  dataPrior = dataPrior.pools;

  // 7d offset
  const dataPrior7d = (
    await request(SUBGRAPH, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d))
  ).pools;

  // calculate tvl
  dataNow = await utils.tvl(dataNow, CHAIN);
  // calculate apy
  dataNow = dataNow.map((el) => utils.apy(el, dataPrior, dataPrior7d, 'v3'));

  const pools = {}
  for (const p of dataNow.filter(p => p.volumeUSD1d >= 0 && (!isNaN(p.apy1d) || !isNaN(p.apy7d)))) {
    const url = 'https://aerodrome.finance/deposit?token0=' + p.token0.id + '&token1=' + p.token1.id + '&factory=' + p.factory;
    const poolMeta = 'CL' + ' - ' + (Number(p.feeTier) / 10000).toString() + '%';
    const underlyingTokens = [p.token0.id, p.token1.id];

    const poolAddress = utils.formatAddress(p.id);
    pools[poolAddress] = {
      pool: poolAddress,
      chain: utils.formatChain('base'),
      project: PROJECT,
      poolMeta,
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

const CHUNK_SIZE = 400;
const POOLS_START_OFFSET = 1650; // Ignore older non-Slipstream pools

// Paginate sugar.all until an empty chunk is returned. Runs chunks sequentially
// because the end offset isn't known in advance.
async function paginatePools(block = undefined, startOffset = POOLS_START_OFFSET) {
  const all = [];
  let offset = startOffset;
  while (true) {
    const chunk = (
      await sdk.api.abi.call({
        target: sugar,
        params: [CHUNK_SIZE, offset],
        abi: abiSugar.find((m) => m.name === 'all'),
        chain: 'base',
        block,
      })
    ).output;
    all.push(...chunk);
    if (chunk.length === 0) break;
    offset += CHUNK_SIZE;
  }
  return all;
}

async function paginateTokens() {
  const all = [];
  let offset = 0;
  while (true) {
    const chunk = (
      await sdk.api.abi.call({
        target: sugar,
        params: [CHUNK_SIZE, offset, sugar, []],
        abi: abiSugar.find((m) => m.name === 'tokens'),
        chain: 'base',
      })
    ).output;
    if (chunk.length === 0) break;
    all.push(...chunk);
    offset += CHUNK_SIZE;
  }
  return all;
}

const getGaugeApy = async () => {
  // pool enum and token enum are independent — run in parallel.
  const [allPoolsRaw, allTokenData] = await Promise.all([
    paginatePools(),
    paginateTokens(),
  ]);
  const allPoolsData = allPoolsRaw.filter(
    (t) => Number(t.type) > 0 && t.gauge != nullAddress
  );

  const tokens = [
    ...new Set(
      allPoolsData
        .map((m) => [m.token0, m.token1])
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
      .map((i) => `base:${i}`)
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

  // Precompute tick bounds; mark pools with zero gauge liquidity as skipped.
  const ZERO = { amount0: 0, amount1: 0 };
  const bounds = allPoolsData.map((pool) => {
    if (Number(pool.gauge_liquidity) == 0) return null;
    const w = tickWidthMappings[Number(pool.type)] !== undefined ? tickWidthMappings[Number(pool.type)] : 5;
    return {
      lowTick: Number(pool.tick) - w * Number(pool.type),
      highTick: Number(pool.tick) + (w - 1) * Number(pool.type),
    };
  });

  // Batch 1+2: sqrtRatio at low and high ticks (parallel, permit per-call failure)
  const sqrtRatioAbi = abiSugarHelper.find((m) => m.name === 'getSqrtRatioAtTick');
  const [lowRatios, highRatios] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: sqrtRatioAbi,
      calls: bounds.map((b) => ({ target: sugarHelper, params: b ? [b.lowTick] : [0] })),
      chain: 'base',
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      abi: sqrtRatioAbi,
      calls: bounds.map((b) => ({ target: sugarHelper, params: b ? [b.highTick] : [0] })),
      chain: 'base',
      permitFailure: true,
    }),
  ]);

  // Batch 3: amounts for liquidity; only call for pools where both ratios succeeded
  const amountsAbi = abiSugarHelper.find((m) => m.name === 'getAmountsForLiquidity');
  const amountsRes = await sdk.api.abi.multiCall({
    abi: amountsAbi,
    calls: allPoolsData.map((pool, i) => {
      const rA = lowRatios.output[i]?.output;
      const rB = highRatios.output[i]?.output;
      if (!bounds[i] || rA == null || rB == null) {
        return { target: sugarHelper, params: [0, 0, 0, 0] };
      }
      return { target: sugarHelper, params: [pool.sqrt_ratio, rA, rB, pool.gauge_liquidity] };
    }),
    chain: 'base',
    permitFailure: true,
  });

  const allStakedData = allPoolsData.map((_, i) => {
    if (!bounds[i]) return ZERO;
    const out = amountsRes.output[i];
    return out?.success && out.output ? out.output : ZERO;
  });

  // on-chain fee fallback: fetch historical snapshots for real fee deltas
  const now = Math.floor(Date.now() / 1000);
  const epochStart = Math.floor(now / WEEK) * WEEK;
  const elapsedSeconds = now - epochStart;

  // previous epoch end = just before current epoch started (full 7d of fees)
  // 24h ago = for 1d delta (only valid if >24h into current epoch)
  // Both snapshots are independent → fetch in parallel.
  let prevEpochFees = {};
  let fees24hAgo = null;
  try {
    const timestamps = [epochStart - 1];
    if (elapsedSeconds > 86400) timestamps.push(now - 86400);
    const historicalBlocks = await utils.getBlocksByTime(timestamps, CHAIN);
    const fetches = [fetchPoolFeesAtBlock(historicalBlocks[0])];
    if (elapsedSeconds > 86400) fetches.push(fetchPoolFeesAtBlock(historicalBlocks[1]));
    const results = await Promise.allSettled(fetches);
    if (results[0].status === 'fulfilled') {
      prevEpochFees = results[0].value;
    } else {
      console.log('Failed to fetch previous-epoch fee snapshot:', results[0].reason?.message);
    }
    if (results[1]?.status === 'fulfilled' && results[1].value) {
      fees24hAgo = results[1].value;
    } else if (results[1]?.status === 'rejected') {
      console.log('Failed to fetch 24h fee snapshot:', results[1].reason?.message);
    }
  } catch (e) {
    console.log('Failed to fetch historical fee data, continuing without on-chain fallback:', e.message);
  }

  const pools = allPoolsData.map((p, i) => {
    const token0Data = allTokenData.find(({token_address}) => token_address == p.token0);
    const token1Data = allTokenData.find(({token_address}) => token_address == p.token1);

    if (!token0Data || !token1Data) return null;

    const p0 = prices[`base:${p.token0}`]?.price;
    const p1 = prices[`base:${p.token1}`]?.price;

    const tvlUsd = ((p.reserve0 / (10**token0Data.decimals)) * p0) + ((p.reserve1 / (10**token1Data.decimals)) * p1);

    // use wider staked TVL across many ticks
    const stakedTvlUsd = ((allStakedData[i]['amount0'] / (10**token0Data.decimals)) * p0) + ((allStakedData[i]['amount1'] / (10**token1Data.decimals)) * p1);

    const s = token0Data.symbol + '-' + token1Data.symbol;

    const apyReward = stakedTvlUsd > 0
      ? (((p.emissions / 1e18) * 86400 * 365 * prices[`base:${AERO}`]?.price) /
          stakedTvlUsd) *
        100
      : 0;

    const url = 'https://aerodrome.finance/deposit?token0=' + p.token0 + '&token1=' + p.token1 + '&type=' + p.type.toString() + '&factory=' + p.factory;
    const poolMeta = 'CL' + p.type.toString() + ' - ' + (p.pool_fee / 10000).toString() + '%';

    const lpKey = p.lp.toLowerCase();
    const d0 = 10**token0Data.decimals;
    const d1 = 10**token1Data.decimals;

    const calcFeeUsd = (fees) =>
      ((fees.token0_fees / d0) * (p0 || 0)) + ((fees.token1_fees / d1) * (p1 || 0));

    const getStakedRatio = (fees) =>
      Number(fees.liquidity) > 0 ? Number(fees.gauge_liquidity) / Number(fees.liquidity) : 1;

    // on-chain fee fallback using real block comparisons
    // 7d: previous epoch's full gauge fees (snapshot just before epoch reset)
    let apyBase7d = null;
    const prev = prevEpochFees[lpKey];
    if (prev && tvlUsd > 0) {
      const feeUsd7d = calcFeeUsd(prev);
      if (feeUsd7d > 0) {
        const ratio = getStakedRatio(prev);
        const totalFeeUsd7d = feeUsd7d / Math.max(ratio, 0.1);
        apyBase7d = ((totalFeeUsd7d / 7) * 365 / tvlUsd) * 100;
      }
    }

    // 1d: fee delta between now and 24h ago (both within same epoch)
    let apyBase = null;
    let volumeUsd1d = null;
    if (fees24hAgo) {
      const currentFeeUsd = calcFeeUsd(p);
      const prior = fees24hAgo[lpKey];
      const priorFeeUsd = prior ? calcFeeUsd(prior) : 0;
      const feeDelta = currentFeeUsd - priorFeeUsd;
      if (feeDelta > 0 && tvlUsd > 0) {
        const ratio = getStakedRatio(p);
        const totalFeeDelta = feeDelta / Math.max(ratio, 0.1);
        apyBase = ((totalFeeDelta * 365) / tvlUsd) * 100;
        if (p.pool_fee > 0) volumeUsd1d = totalFeeDelta / (p.pool_fee / 1e6);
      }
    } else if (elapsedSeconds > 6 * 3600) {
      // <24h into epoch: extrapolate from current epoch fees
      // If distribute() hasn't been called yet, current gaugeFees still contain
      // the previous epoch's fees — subtract them to isolate new accumulation
      const currentFeeUsd = calcFeeUsd(p);
      const prevFeeUsd = prev ? calcFeeUsd(prev) : 0;
      const epochFeeUsd = currentFeeUsd >= prevFeeUsd
        ? currentFeeUsd - prevFeeUsd
        : currentFeeUsd;
      if (epochFeeUsd > 0 && tvlUsd > 0) {
        const ratio = getStakedRatio(p);
        const totalFeeUsd = epochFeeUsd / Math.max(ratio, 0.1);
        const dailyFeeUsd = (totalFeeUsd / elapsedSeconds) * 86400;
        apyBase = ((dailyFeeUsd * 365) / tvlUsd) * 100;
        if (p.pool_fee > 0) volumeUsd1d = dailyFeeUsd / (p.pool_fee / 1e6);
      }
    }

    return {
      pool: utils.formatAddress(p.lp),
      chain: utils.formatChain('base'),
      project: PROJECT,
      symbol: s,
      tvlUsd,
      apyBase,
      apyBase7d,
      apyReward,
      rewardTokens: apyReward ? [AERO] : [],
      underlyingTokens: [p.token0, p.token1],
      poolMeta,
      url,
      volumeUsd1d,
    };
  });

  const poolsApy = {};
  for (const pool of pools.filter((p) => p && utils.keepFinite(p))) {
    poolsApy[pool.pool] = pool;
  }

  return poolsApy;
};

async function main(timestamp = null) {
  const poolsApy = await getGaugeApy();
  let poolsVolumes = {};
  try {
    poolsVolumes = await getPoolVolumes(timestamp);
  } catch (e) {
    console.log('aerodrome-slipstream: subgraph query failed, skipping volume data', e.message);
  }

  // left-join volumes onto APY output to avoid filtering out pools
  return Object.values(poolsApy).map((pool) => {
    const v = poolsVolumes[pool.pool];
    return {
      ...pool,
      apyBase: Number.isFinite(v?.apyBase) ? v.apyBase : pool.apyBase,
      apyBase7d: Number.isFinite(v?.apyBase7d) ? v.apyBase7d : pool.apyBase7d,
      volumeUsd1d: Number.isFinite(v?.volumeUsd1d) ? v.volumeUsd1d : pool.volumeUsd1d,
      volumeUsd7d: v?.volumeUsd7d,
    };
  });
}

module.exports = {
  timetravel: false,
  apy: main,
};
