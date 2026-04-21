const sdk = require('@defillama/sdk');
const axios = require('axios');
const { request, gql } = require('graphql-request');
const utils = require('../utils');

const abiSugar = require('./abiSugar.json');
const abiSugarHelper = require('./abiSugarHelper.json');

const AERO = '0x940181a94A35A4569E4529A3CDfB74e38FD98631';
const sugar = '0x92294D631E995f1dd9CeE4097426e6a71aB87Bcf';
const sugarHelper = '0x6d2D739bf37dFd93D804523c2dfA948EAf32f8E1';
const nullAddress = '0x0000000000000000000000000000000000000000';
const PROJECT = 'aerodrome-slipstream';
const CHAIN = 'base';
const WEEK = 604800;
const SUBGRAPH = sdk.graph.modifyEndpoint(
  'GENunSHWLBXm59mBSgPzQ8metBEp9YDfdqwFr91Av1UM'
);

const tickWidthMappings = { 1: 5, 50: 5, 100: 15, 200: 10, 2000: 2 };

// Fetch gauge fees for all CL pools at a historical block, keyed by lp address.
// Reuses the shared pagination helper defined below.
async function fetchPoolFeesAtBlock(blockNumber) {
  const raw = await paginatePools(blockNumber);
  const fees = {};
  for (const p of raw.filter(
    (t) => Number(t.type) > 0 && t.gauge != nullAddress
  )) {
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

// Query _meta for visibility logging. Staleness enforcement is delegated
const metaQuery = gql`
  {
    _meta {
      block {
        number
        timestamp
      }
      hasIndexingErrors
    }
  }
`;

async function getPoolVolumes(timestamp = null) {
  if (timestamp === null) {
    try {
      const meta = await utils.withRetry(() => request(SUBGRAPH, metaQuery));
      const lagSec =
        Math.floor(Date.now() / 1000) - Number(meta._meta.block.timestamp);
      console.log(
        `aerodrome-slipstream: subgraph at block ${meta._meta.block.number} (${lagSec}s behind now), indexingErrors=${meta._meta.hasIndexingErrors}`
      );
    } catch (e) {
      // non-fatal: utils.getBlocks will enforce staleness below
      console.log(
        'aerodrome-slipstream: subgraph _meta probe failed:',
        e.message
      );
    }
  }

  let [block, blockPrior] = await utils.getBlocks(CHAIN, timestamp, [SUBGRAPH]);
  // buffer so data indexers behind the _meta endpoint can still serve the query
  block -= 100;

  const [_, blockPrior7d] = await utils.getBlocks(
    CHAIN,
    timestamp,
    [SUBGRAPH],
    604800
  );

  // Subgraph (gated through the Arbitrum gateway) occasionally drops TLS
  // mid-handshake — retry transient network failures so one blip doesn't
  // force us into the much slower archive-RPC fallback path.
  let dataNow = await utils.withRetry(() =>
    request(SUBGRAPH, query.replace('<PLACEHOLDER>', block))
  );
  dataNow = dataNow.pools;

  // pull 24h offset data to calculate fees from swap volume
  let queryPriorC = queryPrior;
  let dataPrior = await utils.withRetry(() =>
    request(SUBGRAPH, queryPriorC.replace('<PLACEHOLDER>', blockPrior))
  );
  dataPrior = dataPrior.pools;

  // 7d offset
  const dataPrior7d = (
    await utils.withRetry(() =>
      request(SUBGRAPH, queryPriorC.replace('<PLACEHOLDER>', blockPrior7d))
    )
  ).pools;

  // calculate tvl
  dataNow = await utils.tvl(dataNow, CHAIN);
  // calculate apy
  dataNow = dataNow.map((el) => utils.apy(el, dataPrior, dataPrior7d, 'v3'));

  const pools = {};
  for (const p of dataNow.filter(
    (p) => p.volumeUSD1d >= 0 && (!isNaN(p.apy1d) || !isNaN(p.apy7d))
  )) {
    const url =
      'https://aerodrome.finance/deposit?token0=' +
      p.token0.id +
      '&token1=' +
      p.token1.id +
      '&factory=' +
      p.factory;
    const poolMeta =
      'CL' + ' - ' + (Number(p.feeTier) / 10000).toString() + '%';
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
    };
  }

  return pools;
}

const CHUNK_SIZE = 400;
const POOLS_START_OFFSET = 1650; // Ignore older non-Slipstream pools
const PAGINATE_CONCURRENCY = 8;

// Generic wave-parallel paginator. End offset is unknown, so we issue
// PAGINATE_CONCURRENCY chunk requests at a time; we terminate only on an
// EMPTY chunk (length === 0). Note: sugar.tokens returns variable-size
// chunks in the middle of its list, so partial chunks do NOT mean end.
// Sequential pagination costs ~30-50s for sugar.all/tokens; parallel ≈ 5-10s.
async function paginateWithWaves({ params, abiName, block }) {
  const abi = abiSugar.find((m) => m.name === abiName);
  const all = [];
  let waveStart = 0;
  while (true) {
    const offsets = [];
    for (let i = 0; i < PAGINATE_CONCURRENCY; i++) offsets.push(waveStart + i);
    const chunks = await Promise.all(
      offsets.map((idx) =>
        sdk.api.abi
          .call({
            target: sugar,
            params: params(idx * CHUNK_SIZE),
            abi,
            chain: 'base',
            block,
          })
          .then((r) => r.output)
      )
    );
    // Accumulate everything we got, then check if the wave contained an
    // empty chunk — that's the end marker. Any non-empty chunk after an
    // empty one in the same wave would be discarded, but sugar's pagination
    // is dense enough that once we see an empty chunk, later offsets are
    // also empty.
    let end = false;
    for (const c of chunks) {
      if (c.length === 0) {
        end = true;
        break;
      }
      all.push(...c);
    }
    if (end) break;
    waveStart += PAGINATE_CONCURRENCY;
  }
  return all;
}

const paginatePools = (block = undefined, startOffset = POOLS_START_OFFSET) =>
  paginateWithWaves({
    params: (o) => [CHUNK_SIZE, startOffset + o],
    abiName: 'all',
    block,
  });

// Fetch ERC-20 symbol + decimals for only the token addresses we use.
// sugar.tokens returns ~11k token tuples — we use ~374. This targeted
// multicall fetches both fields for just those 374 addresses, saving
// ~10k wasted tuples on every run.
async function fetchTokenMetadata(addresses) {
  const calls = addresses.map((target) => ({ target }));
  const [symbolRes, decimalsRes] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: 'string:symbol',
      calls,
      chain: 'base',
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      abi: 'uint8:decimals',
      calls,
      chain: 'base',
      permitFailure: true,
    }),
  ]);
  const map = new Map();
  for (let i = 0; i < addresses.length; i++) {
    const sym = symbolRes.output[i];
    const dec = decimalsRes.output[i];
    if (
      sym?.success &&
      dec?.success &&
      sym.output != null &&
      dec.output != null
    ) {
      map.set(addresses[i], {
        token_address: addresses[i],
        symbol: sym.output,
        decimals: Number(dec.output),
      });
    }
  }
  return map;
}

const getGaugeApy = async ({ skipHistoricalFees = false } = {}) => {
  const allPoolsRaw = await paginatePools();
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

  // Fetch token metadata only for the addresses we actually use.
  const tokenByAddr = await fetchTokenMetadata(tokens);

  const maxSize = 50;
  const pages = Math.ceil(tokens.length / maxSize);
  // Parallelise price page fetches. Sequential was ~4s for 8 pages.
  const pricePages = await Promise.all(
    [...Array(pages).keys()].map((p) => {
      const x = tokens
        .slice(p * maxSize, maxSize * (p + 1))
        .map((i) => `base:${i}`)
        .join(',');
      return axios
        .get(`https://coins.llama.fi/prices/current/${x}`)
        .then((r) => r.data.coins);
    })
  );
  const prices = Object.assign({}, ...pricePages);

  // Precompute tick bounds; null entries = pools with zero gauge liquidity.
  const ZERO = { amount0: 0, amount1: 0 };
  const bounds = allPoolsData.map((pool) => {
    if (Number(pool.gauge_liquidity) == 0) return null;
    const w =
      tickWidthMappings[Number(pool.type)] !== undefined
        ? tickWidthMappings[Number(pool.type)]
        : 5;
    return {
      lowTick: Number(pool.tick) - w * Number(pool.type),
      highTick: Number(pool.tick) + (w - 1) * Number(pool.type),
    };
  });

  // Only active pools need sqrtRatio + amounts RPC calls.
  // ~14% of active CL pools have zero gauge_liquidity — skip their calls entirely.
  const activeIdx = [];
  for (let i = 0; i < bounds.length; i++) if (bounds[i]) activeIdx.push(i);

  // Batch 1+2: sqrtRatio at low and high ticks for active pools only.
  const sqrtRatioAbi = abiSugarHelper.find(
    (m) => m.name === 'getSqrtRatioAtTick'
  );
  const [lowRatios, highRatios] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: sqrtRatioAbi,
      calls: activeIdx.map((i) => ({
        target: sugarHelper,
        params: [bounds[i].lowTick],
      })),
      chain: 'base',
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      abi: sqrtRatioAbi,
      calls: activeIdx.map((i) => ({
        target: sugarHelper,
        params: [bounds[i].highTick],
      })),
      chain: 'base',
      permitFailure: true,
    }),
  ]);

  // Batch 3: amounts for liquidity — skip entries where either ratio failed.
  const amountsAbi = abiSugarHelper.find(
    (m) => m.name === 'getAmountsForLiquidity'
  );
  const amountsCalls = activeIdx.map((poolIdx, j) => {
    const pool = allPoolsData[poolIdx];
    const rA = lowRatios.output[j]?.output;
    const rB = highRatios.output[j]?.output;
    if (rA == null || rB == null) {
      return { target: sugarHelper, params: [0, 0, 0, 0] };
    }
    return {
      target: sugarHelper,
      params: [pool.sqrt_ratio, rA, rB, pool.gauge_liquidity],
    };
  });
  const amountsRes = await sdk.api.abi.multiCall({
    abi: amountsAbi,
    calls: amountsCalls,
    chain: 'base',
    permitFailure: true,
  });

  // Map back: all pools default to ZERO, active pools overwritten on success.
  const allStakedData = new Array(allPoolsData.length).fill(ZERO);
  for (let j = 0; j < activeIdx.length; j++) {
    const out = amountsRes.output[j];
    if (out?.success && out.output) allStakedData[activeIdx[j]] = out.output;
  }

  // on-chain fee fallback: fetch historical snapshots for real fee deltas.
  // Skipped when subgraph returned volumes — those give us accurate 1d/7d
  // APY without hammering the archive-state RPC (~240s saved per run).
  const now = Math.floor(Date.now() / 1000);
  const epochStart = Math.floor(now / WEEK) * WEEK;
  const elapsedSeconds = now - epochStart;

  let prevEpochFees = {};
  let fees24hAgo = null;
  if (!skipHistoricalFees) {
    // previous epoch end = just before current epoch started (full 7d of fees)
    // 24h ago = for 1d delta (only valid if >24h into current epoch)
    // Hard-timeout each historical fetch so a stuck archive-state RPC
    // can't consume the full 900s Lambda budget. 180s chosen to give
    // genuinely-slow-but-working archive RPCs room to complete without
    // letting broken ones eat the whole invocation.
    const HISTORICAL_FETCH_TIMEOUT_MS = 180_000;
    const withTimeout = (promise, ms, label) => {
      let timerId;
      const timeout = new Promise((_, reject) => {
        timerId = setTimeout(
          () => reject(new Error(`${label} timed out after ${ms}ms`)),
          ms
        );
      });
      return Promise.race([promise, timeout]).finally(() =>
        clearTimeout(timerId)
      );
    };

    try {
      const timestamps = [epochStart - 1];
      if (elapsedSeconds > 86400) timestamps.push(now - 86400);
      const historicalBlocks = await utils.getBlocksByTime(timestamps, CHAIN);
      const fetches = [
        withTimeout(
          fetchPoolFeesAtBlock(historicalBlocks[0]),
          HISTORICAL_FETCH_TIMEOUT_MS,
          'prev-epoch fee snapshot'
        ),
      ];
      if (elapsedSeconds > 86400) {
        fetches.push(
          withTimeout(
            fetchPoolFeesAtBlock(historicalBlocks[1]),
            HISTORICAL_FETCH_TIMEOUT_MS,
            '24h fee snapshot'
          )
        );
      }
      const results = await Promise.allSettled(fetches);
      if (results[0].status === 'fulfilled') {
        prevEpochFees = results[0].value;
      } else {
        console.log(
          'Failed to fetch previous-epoch fee snapshot:',
          results[0].reason?.message
        );
      }
      if (results[1]?.status === 'fulfilled' && results[1].value) {
        fees24hAgo = results[1].value;
      } else if (results[1]?.status === 'rejected') {
        console.log(
          'Failed to fetch 24h fee snapshot:',
          results[1].reason?.message
        );
      }
    } catch (e) {
      console.log(
        'Failed to fetch historical fee data, continuing without on-chain fallback:',
        e.message
      );
    }
  }

  const pools = allPoolsData.map((p, i) => {
    const token0Data = tokenByAddr.get(p.token0);
    const token1Data = tokenByAddr.get(p.token1);

    if (!token0Data || !token1Data) return null;

    const p0 = prices[`base:${p.token0}`]?.price;
    const p1 = prices[`base:${p.token1}`]?.price;

    const tvlUsd =
      (p.reserve0 / 10 ** token0Data.decimals) * p0 +
      (p.reserve1 / 10 ** token1Data.decimals) * p1;

    // use wider staked TVL across many ticks
    const stakedTvlUsd =
      (allStakedData[i]['amount0'] / 10 ** token0Data.decimals) * p0 +
      (allStakedData[i]['amount1'] / 10 ** token1Data.decimals) * p1;

    const s = token0Data.symbol + '-' + token1Data.symbol;

    const apyReward =
      stakedTvlUsd > 0
        ? (((p.emissions / 1e18) *
            86400 *
            365 *
            prices[`base:${AERO}`]?.price) /
            stakedTvlUsd) *
          100
        : 0;

    const url =
      'https://aerodrome.finance/deposit?token0=' +
      p.token0 +
      '&token1=' +
      p.token1 +
      '&type=' +
      p.type.toString() +
      '&factory=' +
      p.factory;
    const poolMeta =
      'CL' + p.type.toString() + ' - ' + (p.pool_fee / 10000).toString() + '%';

    const lpKey = p.lp.toLowerCase();
    const d0 = 10 ** token0Data.decimals;
    const d1 = 10 ** token1Data.decimals;

    const calcFeeUsd = (fees) =>
      (fees.token0_fees / d0) * (p0 || 0) + (fees.token1_fees / d1) * (p1 || 0);

    const getStakedRatio = (fees) =>
      Number(fees.liquidity) > 0
        ? Number(fees.gauge_liquidity) / Number(fees.liquidity)
        : 1;

    // on-chain fee fallback using real block comparisons
    // 7d: previous epoch's full gauge fees (snapshot just before epoch reset)
    let apyBase7d = null;
    const prev = prevEpochFees[lpKey];
    if (prev && tvlUsd > 0) {
      const feeUsd7d = calcFeeUsd(prev);
      if (feeUsd7d > 0) {
        const ratio = getStakedRatio(prev);
        const totalFeeUsd7d = feeUsd7d / Math.max(ratio, 0.1);
        apyBase7d = (((totalFeeUsd7d / 7) * 365) / tvlUsd) * 100;
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
      const epochFeeUsd =
        currentFeeUsd >= prevFeeUsd
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
  // Run subgraph first. When it succeeds (the common case — see
  // check-subgraph-lag.js: ~seconds lag, 100% success rate, p95 <600ms) its
  // per-pool apyBase/apyBase7d/volume numbers are authoritative. We then
  // skip the archive-state historical fee pagination in getGaugeApy (that
  // path routinely burns 120s+ per snapshot on slow archive RPCs). Only
  // when subgraph genuinely fails do we pay for the on-chain fallback.
  let poolsVolumes = {};
  try {
    poolsVolumes = await getPoolVolumes(timestamp);
  } catch (e) {
    console.log(
      'aerodrome-slipstream: subgraph query failed, skipping volume data',
      e.message
    );
  }

  const subgraphHealthy = Object.keys(poolsVolumes).length > 0;
  const poolsApy = await getGaugeApy({ skipHistoricalFees: subgraphHealthy });

  // left-join volumes onto APY output to avoid filtering out pools
  return Object.values(poolsApy).map((pool) => {
    const v = poolsVolumes[pool.pool];
    return {
      ...pool,
      apyBase: Number.isFinite(v?.apyBase) ? v.apyBase : pool.apyBase,
      apyBase7d: Number.isFinite(v?.apyBase7d) ? v.apyBase7d : pool.apyBase7d,
      volumeUsd1d: Number.isFinite(v?.volumeUsd1d)
        ? v.volumeUsd1d
        : pool.volumeUsd1d,
      volumeUsd7d: v?.volumeUsd7d,
    };
  });
}

module.exports = {
  timetravel: false,
  apy: main,
};
