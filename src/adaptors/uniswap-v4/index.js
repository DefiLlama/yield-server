const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const utils = require('../utils');

const chains = {
  ethereum: sdk.graph.modifyEndpoint(
    'DiYPVdygkfjDWhbxGSqAQxwBKmfKnkWQojqeM2rkLb3G'
  ),
  base: sdk.graph.modifyEndpoint(
    'Gqm2b5J85n1bhCyDMpGbtbVn4935EvvdyHdHrx3dibyj'
  ),
  arbitrum: sdk.graph.modifyEndpoint(
    'G5TsTKNi8yhPSV7kycaE23oWbqv9zzNqR49FoEQjzq1r'
  ),
  polygon: sdk.graph.modifyEndpoint(
    '2CB2uQxcDKWDenagn2z17KQVCtfwSx5eXYuvqTciRTJu'
  ),
  unichain: sdk.graph.modifyEndpoint(
    'aa3YpPCxatg4LaBbLFuv2iBC8Jvs9u3hwt5GTpS4Kit'
  ),
  bsc: sdk.graph.modifyEndpoint('EAq1nJKgjnuKH6Gj4RFjCW7LcL7E2uipbncdwV7TTWkX'),
  avax: sdk.graph.modifyEndpoint(
    '49JxRo9FGxWpSf5Y5GKQPj5NUpX2HhpoZHpGzNEWQZjq'
  ),
  optimism: sdk.graph.modifyEndpoint(
    '6RBtsmGUYfeLeZsYyxyKSUiaA6WpuC69shMEQ1Cfuj9u'
  ),
};

// Chains where the only allocated indexer prunes historical state, which
// breaks the block-offset queries used by topLvl. Volume for these chains
// comes from poolDayDatas at the latest block instead.
const dayDataChains = {
  monad: sdk.graph.modifyEndpoint(
    '6CQtx9W4b9Kn9cjznXJNLeTvLV1hbpxkaJZkbyXirJuz'
  ),
};

// the ethereum subgraph above halts on a deterministic indexing error every so
// often; _meta keeps reporting a fresh head while no indexer can attest a block
// past the halt, so every pool query fails and the chain silently drops out.
// this independently published subgraph indexes the same v4 poolIds (verified
// identical ids and fee values) and stays at the chain tip, but prunes history,
// so the daily leg comes from PoolManager Swap logs instead of a block offset.
const fallbackChains = {
  ethereum: {
    url: sdk.graph.modifyEndpoint(
      '8B2wKxnkciCTc5HSgsAojF6vhKn6wxQ1nVecYzMge1hA'
    ),
    poolManager: '0x000000000004444c5dc75cB358380D2e3dE08A90',
    // a halted subgraph throws and yields nothing, but one that serves a badly
    // incomplete set is just as useless and would otherwise pass a >0 check.
    // healthy runs return ~480 pools here, so anything near this floor is broken
    minPools: 100,
  },
};

// v4 reports the fee actually charged on every swap, so summing the logs prices
// hook-set dynamic fees correctly instead of writing them off as 0
const SWAP_EVENT =
  'event Swap(bytes32 indexed id, address indexed sender, int128 amount0, int128 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick, uint24 fee)';

const DYNAMIC_FEE_FLAG = 0x800000;
const PAGE_SIZE = 1000;
const TVL_MIN = 50000;
// the fallback subgraph prices tokens itself and gets it wrong often enough that
// its own tvl is only usable as a coarse prefilter; utils.tvl decides the real floor
const FALLBACK_PREFILTER_TVL = 5000;
const SUSPECT_TVL_USD = 1e8;
const MIN_VOLUME_TO_TVL_RATIO = 1e-5;

const POOL_FIELDS = `
      id
      feeTier
      totalValueLockedUSD
      totalValueLockedToken0
      totalValueLockedToken1
      createdAtTimestamp
      token0 {
        symbol
        decimals
        id
      }
      token1 {
        symbol
        decimals
        id
      }`;

// utils.withRetry only retries HTTP 429/5xx; indexer errors arrive as HTTP 200
// with an errors body, which graphql-request throws as a ClientError
const requestWithRetry = async (url, query, retries = 2) => {
  for (let i = 0; ; i++) {
    try {
      return await request(url, query);
    } catch (e) {
      if (i === retries) throw e;
      await new Promise((r) => setTimeout(r, 1000 * 2 ** i));
    }
  }
};

// polygon's deployment times out scanning pools in id order for the few that
// clear TVL_MIN, while unichain's times out sorting them by tvl
const TVL_ORDERED_CHAINS = new Set(['polygon']);

const queryWithSkip = (skip) => gql`
  {
    pools(first: ${PAGE_SIZE}, skip: ${skip}, orderBy: totalValueLockedUSD, orderDirection: desc, where: {totalValueLockedUSD_gte: ${TVL_MIN}}, block: {number: <PLACEHOLDER>}) {${POOL_FIELDS}
    }
  }
`;

const queryWithCursor = (idCursor, block) => gql`
  {
    pools(first: ${PAGE_SIZE}, orderBy: id, orderDirection: asc, where: {totalValueLockedUSD_gte: ${TVL_MIN}, id_gt: "${idCursor}"}, block: {number: ${block}}) {${POOL_FIELDS}
    }
  }
`;

const fetchAllPools = async (url, block, tvlOrdered) => {
  const allPools = [];
  let skip = 0;

  while (true) {
    const q = tvlOrdered
      ? queryWithSkip(skip).replace('<PLACEHOLDER>', block)
      : queryWithCursor(allPools.at(-1)?.id ?? '', block);
    const page = (await requestWithRetry(url, q)).pools ?? [];
    allPools.push(...page);
    if (page.length < PAGE_SIZE) break;
    skip += PAGE_SIZE;
  }

  return allPools;
};

const isDynamicFeePool = (feeTier) => Number(feeTier) === DYNAMIC_FEE_FLAG;

const formatPool = (chainString, p) => {
  const isDynamic = isDynamicFeePool(p.feeTier);

  let poolMeta;
  if (isDynamic) {
    poolMeta = 'Dynamic fee (hook)';
  } else {
    const feePercent = (Number(p.feeTier) / 1e4).toFixed(2);
    poolMeta = `${feePercent}%`;
  }

  const underlyingTokens = [p.token0.id, p.token1.id];
  const chain = chainString === 'avax' ? 'avalanche' : chainString;

  return {
    pool: `${p.id}-${chainString}-uniswap-v4`,
    chain: utils.formatChain(chainString),
    project: 'uniswap-v4',
    token: null,
    poolMeta,
    symbol: `${p.token0.symbol}-${p.token1.symbol}`,
    tvlUsd: p.totalValueLockedUSD,
    apyBase: p.apyBase,
    underlyingTokens,
    url: `https://app.uniswap.org/explore/pools/${chain}/${p.id}`,
    volumeUsd1d: p.volumeUsd1d,
  };
};

const hasInvalidTokenTvl = (pool) =>
  Number(pool.totalValueLockedToken0) < 0 ||
  Number(pool.totalValueLockedToken1) < 0;

const hasSuspiciousTvlVolume = (pool) =>
  pool.tvlUsd > SUSPECT_TVL_USD &&
  Number(pool.volumeUsd1d || 0) / pool.tvlUsd < MIN_VOLUME_TO_TVL_RATIO;

/**
 * Prices volume and APY from the last completed UTC day. Pools without a full
 * day of history are omitted rather than annualizing a partial day.
 */
const topLvl = async (chainString, url, timestamp) => {
  try {
    const [block] = await utils.getBlocks(chainString, timestamp, [url]);
    const previousDay =
      (Math.floor(Number(timestamp ?? Math.floor(Date.now() / 1000)) / 86400) -
        1) *
      86400;

    let [dataNow, volumesByPoolId] = await Promise.all([
      fetchAllPools(url, block, TVL_ORDERED_CHAINS.has(chainString)),
      fetchDayVolumes(
        url,
        previousDay,
        1,
        `pool_: {totalValueLockedUSD_gte: ${TVL_MIN}}`
      ),
    ]);

    dataNow = dataNow.map((p) => ({
      ...p,
      reserve0: p.totalValueLockedToken0,
      reserve1: p.totalValueLockedToken1,
    }));
    dataNow = dataNow.filter((p) => !hasInvalidTokenTvl(p));

    dataNow = await utils.tvl(dataNow, chainString);
    dataNow = dataNow.filter((pool) => pool.totalValueLockedUSD >= TVL_MIN);

    dataNow = dataNow.map((pool) => {
      const volumes = volumesByPoolId[pool.id];
      const hasFullDay = Number(pool.createdAtTimestamp || 0) <= previousDay;
      const volumeUSD1d = hasFullDay
        ? Number(volumes?.volumeUSD1d ?? 0)
        : undefined;
      const feeUSD1d = hasFullDay ? Number(volumes?.feeUSD1d ?? 0) : undefined;

      let apy;
      if (volumeUSD1d === undefined) {
        apy = undefined;
      } else if (pool.totalValueLockedUSD > 0 && feeUSD1d > 0) {
        apy = (feeUSD1d * 365 * 100) / pool.totalValueLockedUSD;
      } else {
        apy = 0;
      }

      return {
        ...pool,
        apyBase: apy,
        volumeUsd1d: volumeUSD1d,
      };
    });

    return dataNow.map((p) => formatPool(chainString, p));
  } catch (e) {
    console.log(chainString, e);
    return [];
  }
};

const latestPoolsQuery = (idCursor) => gql`
  {
    pools(first: ${PAGE_SIZE}, orderBy: id, orderDirection: asc, where: {totalValueLockedUSD_gte: ${TVL_MIN}, id_gt: "${idCursor}"}) {${POOL_FIELDS}
    }
  }
`;

const poolsByIdQuery = (ids) => gql`
  {
    pools(first: ${PAGE_SIZE}, where: {id_in: ${JSON.stringify(ids)}}) {${POOL_FIELDS}
    }
  }
`;

const dayVolumesQuery = (dateGte, dateLte, idCursor, poolFilter) => gql`
  {
    poolDayDatas(first: ${PAGE_SIZE}, orderBy: id, orderDirection: asc, where: {date_gte: ${dateGte}, date_lte: ${dateLte}, id_gt: "${idCursor}", ${poolFilter}}) {
      id
      date
      volumeUSD
      feesUSD
      pool {
        id
      }
    }
  }
`;

const fetchLatestPools = async (url) => {
  const allPools = [];
  let idCursor = '';

  while (true) {
    const data = await requestWithRetry(url, latestPoolsQuery(idCursor));
    const page = data.pools ?? [];
    allPools.push(...page);
    if (page.length < PAGE_SIZE) break;
    idCursor = page[page.length - 1].id;
  }

  return allPools;
};

// returns { poolId: { volumeUSD1d, volumeUSD7d, feeUSD1d, feeUSD7d } } built
// from the requested full days of poolDayDatas; the most recent full day
// supplies the 1d values
const fetchDayVolumes = async (url, previousDay, days = 7, poolFilter = '') => {
  const volumesByPoolId = {};
  const firstDay = previousDay - (days - 1) * 86400;
  let idCursor = '';

  while (true) {
    const data = await requestWithRetry(
      url,
      dayVolumesQuery(firstDay, previousDay, idCursor, poolFilter)
    );
    const page = data.poolDayDatas ?? [];

    for (const dayData of page) {
      const poolId = dayData.pool.id;
      const volumes = volumesByPoolId[poolId] ?? {
        volumeUSD1d: 0,
        volumeUSD7d: 0,
        feeUSD1d: 0,
        feeUSD7d: 0,
      };

      volumes.volumeUSD7d += Number(dayData.volumeUSD);
      volumes.feeUSD7d += Number(dayData.feesUSD);
      if (Number(dayData.date) === previousDay) {
        volumes.volumeUSD1d += Number(dayData.volumeUSD);
        volumes.feeUSD1d += Number(dayData.feesUSD);
      }

      volumesByPoolId[poolId] = volumes;
    }

    if (page.length < PAGE_SIZE) break;
    idCursor = page[page.length - 1].id;
  }

  return volumesByPoolId;
};

const topLvlDayData = async (chainString, url) => {
  try {
    // freshness assertion only; throws when the subgraph lags the chain
    await utils.getBlocks(chainString, null, [url]);

    const previousDay = (Math.floor(Date.now() / 1000 / 86400) - 1) * 86400;
    const [tvlPools, volumesByPoolId] = await Promise.all([
      fetchLatestPools(url),
      fetchDayVolumes(url, previousDay),
    ]);

    const knownPoolIds = new Set(tvlPools.map((pool) => pool.id));
    const missingPoolIds = Object.keys(volumesByPoolId).filter(
      (poolId) => !knownPoolIds.has(poolId)
    );

    let dataNow = [...tvlPools];
    for (let start = 0; start < missingPoolIds.length; start += 100) {
      const data = await requestWithRetry(
        url,
        poolsByIdQuery(missingPoolIds.slice(start, start + 100))
      );
      dataNow = dataNow.concat(data.pools ?? []);
    }

    dataNow = dataNow
      .filter((pool) => !hasInvalidTokenTvl(pool))
      .map((pool) => ({
        ...pool,
        reserve0: pool.totalValueLockedToken0,
        reserve1: pool.totalValueLockedToken1,
      }));

    dataNow = await utils.tvl(dataNow, chainString);
    dataNow = dataNow.filter((pool) => pool.totalValueLockedUSD >= TVL_MIN);

    return dataNow.map((pool) => {
      const volumes = volumesByPoolId[pool.id];
      const hasFullDay = Number(pool.createdAtTimestamp || 0) <= previousDay;
      const hasFullWeek =
        Number(pool.createdAtTimestamp || 0) <= previousDay - 6 * 86400;
      const volumeUSD1d = hasFullDay
        ? Number(volumes?.volumeUSD1d ?? 0)
        : undefined;
      const volumeUSD7d = hasFullWeek
        ? Number(volumes?.volumeUSD7d ?? 0)
        : undefined;
      const feeUSD1d = hasFullDay ? Number(volumes?.feeUSD1d ?? 0) : undefined;
      const feeUSD7d = hasFullWeek ? Number(volumes?.feeUSD7d ?? 0) : undefined;

      const toApy = (annualFeesUsd) =>
        pool.totalValueLockedUSD > 0 && annualFeesUsd > 0
          ? (annualFeesUsd * 100) / pool.totalValueLockedUSD
          : 0;

      return {
        ...formatPool(chainString, {
          ...pool,
          apyBase: feeUSD1d === undefined ? undefined : toApy(feeUSD1d * 365),
          volumeUsd1d: volumeUSD1d,
        }),
        apyBase7d: feeUSD7d === undefined ? undefined : toApy(feeUSD7d * 52),
        volumeUsd7d: volumeUSD7d,
      };
    });
  } catch (e) {
    console.log(chainString, e);
    return [];
  }
};

const fallbackPoolsQuery = (idCursor) => gql`
  {
    pools(first: ${PAGE_SIZE}, orderBy: id, orderDirection: asc, where: {totalValueLockedUSD_gte: ${FALLBACK_PREFILTER_TVL}, id_gt: "${idCursor}"}) {
      id
      feeTier: fee
      totalValueLockedUSD
      totalValueLockedToken0
      totalValueLockedToken1
      createdAtTimestamp
      token0 {
        symbol
        decimals
        id
      }
      token1 {
        symbol
        decimals
        id
      }
    }
  }
`;

// timestamp is a String in this schema, so the bounds are compared
// lexicographically -- fine while unix seconds stay 10 digits wide
const snapshotVolumesQuery = (dayIndex, idCursor) => gql`
  {
    poolSnapshots(first: ${PAGE_SIZE}, orderBy: id, orderDirection: asc, where: {id_gt: "${idCursor}", timestamp_gte: "${
  dayIndex * 86400
}", timestamp_lt: "${(dayIndex + 1) * 86400}"}) {
      id
      volumeUSD
      pool {
        id
      }
    }
  }
`;

const fetchFallbackPools = async (url) => {
  const allPools = [];
  let idCursor = '';

  while (true) {
    const data = await requestWithRetry(url, fallbackPoolsQuery(idCursor));
    const page = data.pools ?? [];
    allPools.push(...page);
    if (page.length < PAGE_SIZE) break;
    idCursor = page[page.length - 1].id;
  }

  return allPools;
};

// poolSnapshots carry lifetime-cumulative volume as of the end of each UTC day,
// so a span's volume is the difference between two buckets
const fetchCumulativeVolumes = async (url, dayIndex) => {
  const volumeByPoolId = {};
  let idCursor = '';

  while (true) {
    const data = await requestWithRetry(
      url,
      snapshotVolumesQuery(dayIndex, idCursor)
    );
    const page = data.poolSnapshots ?? [];
    for (const snapshot of page) {
      volumeByPoolId[snapshot.pool.id] = Number(snapshot.volumeUSD);
    }
    if (page.length < PAGE_SIZE) break;
    idCursor = page[page.length - 1].id;
  }

  return volumeByPoolId;
};

const absolute = (value) => (value < 0n ? -value : value);

const getBlockAt = async (chainString, timestamp) => {
  const data = await utils.getPriceApiData(
    `/block/${chainString}/${timestamp}`
  );
  return {
    block: Number(data.height ?? data.number),
    timestamp: Number(data.timestamp ?? timestamp),
  };
};

// sums the last completed UTC day of swaps per pool, in raw token units for
// both legs, along with the fee each swap actually paid
const fetchSwapTotals = async (
  chainString,
  poolManager,
  fromTimestamp,
  toTimestamp
) => {
  const [start, end] = await Promise.all([
    getBlockAt(chainString, fromTimestamp),
    getBlockAt(chainString, toTimestamp),
  ]);
  const blockPrior =
    start.timestamp < fromTimestamp ? start.block + 1 : start.block;
  const block = end.timestamp >= toTimestamp ? end.block - 1 : end.block;

  const logs = await sdk.getEventLogs({
    target: poolManager,
    chain: chainString,
    fromBlock: blockPrior,
    toBlock: block,
    eventAbi: SWAP_EVENT,
    onlyArgs: true,
  });

  const totalsByPoolId = {};
  for (const log of logs) {
    const poolId = log.id.toLowerCase();
    const amount0 = absolute(BigInt(log.amount0));
    const amount1 = absolute(BigInt(log.amount1));
    const totals = (totalsByPoolId[poolId] ??= {
      amount0: 0n,
      amount1: 0n,
      fees0: 0n,
      fees1: 0n,
    });
    totals.amount0 += amount0;
    totals.amount1 += amount1;
    totals.fees0 += (amount0 * BigInt(log.fee)) / 1000000n;
    totals.fees1 += (amount1 * BigInt(log.fee)) / 1000000n;
  }

  return totalsByPoolId;
};

const topLvlFallback = async (chainString, { url, poolManager }) => {
  try {
    const today = Math.floor(Date.now() / 1000 / 86400);
    const previousDay = (today - 1) * 86400;
    const [pools, swapTotals, endOfYesterday, endOfWeekBefore] =
      await Promise.all([
        fetchFallbackPools(url),
        fetchSwapTotals(chainString, poolManager, previousDay, today * 86400),
        fetchCumulativeVolumes(url, today - 1),
        fetchCumulativeVolumes(url, today - 8),
      ]);

    let dataNow = pools
      .filter((pool) => !hasInvalidTokenTvl(pool))
      .map((pool) => ({
        ...pool,
        reserve0: pool.totalValueLockedToken0,
        reserve1: pool.totalValueLockedToken1,
      }));

    dataNow = await utils.tvl(dataNow, chainString);
    dataNow = dataNow.filter((pool) => pool.totalValueLockedUSD >= TVL_MIN);

    return dataNow.map((pool) => {
      const totals = swapTotals[pool.id.toLowerCase()];

      // both legs of a swap are worth the same, so whichever side has a price
      // gives the same figure; token0 is preferred only because it is arbitrary
      const toUsd = (raw, token, price) =>
        price === undefined
          ? undefined
          : (Number(raw) / 10 ** Number(token.decimals)) * price;

      const hasFullDay = Number(pool.createdAtTimestamp || 0) <= previousDay;
      const volumeUSD1d = hasFullDay
        ? (totals &&
            (toUsd(totals.amount0, pool.token0, pool.price0) ??
              toUsd(totals.amount1, pool.token1, pool.price1))) ||
          0
        : undefined;
      const feeUSD1d = hasFullDay
        ? (totals &&
            (toUsd(totals.fees0, pool.token0, pool.price0) ??
              toUsd(totals.fees1, pool.token1, pool.price1))) ||
          0
        : undefined;

      // a pool younger than the window, or one absent from either bucket, has no
      // measurable 7d span -- distinct from a pool that spanned it and traded 0
      const volumeUSD7d =
        endOfYesterday[pool.id] !== undefined &&
        endOfWeekBefore[pool.id] !== undefined
          ? endOfYesterday[pool.id] - endOfWeekBefore[pool.id]
          : undefined;
      const isDynamic = isDynamicFeePool(pool.feeTier);

      const toApy = (annualFeesUsd) =>
        pool.totalValueLockedUSD > 0 && annualFeesUsd > 0
          ? (annualFeesUsd * 100) / pool.totalValueLockedUSD
          : 0;

      // the swap logs carry the fee a hook actually charged, so apyBase covers
      // dynamic pools; the 7d leg only has snapshot volume, which cannot be
      // priced without a fee rate. undefined reads as "not measured", 0 would
      // read as "earned nothing"
      const apyBase7d =
        isDynamic || volumeUSD7d === undefined
          ? undefined
          : toApy(volumeUSD7d * (Number(pool.feeTier) / 1e6) * 52);

      return {
        ...formatPool(chainString, {
          ...pool,
          apyBase: feeUSD1d === undefined ? undefined : toApy(feeUSD1d * 365),
          volumeUsd1d: volumeUSD1d,
        }),
        apyBase7d,
        volumeUsd7d: volumeUSD7d,
      };
    });
  } catch (e) {
    console.log(`${chainString} fallback`, e);
    return [];
  }
};

const main = async (timestamp = null) => {
  const data = await Promise.all([
    ...Object.entries(chains).map(async ([chain, url]) => {
      const pools = await topLvl(chain, url, timestamp);
      const fallback = fallbackChains[chain];
      // the fallback subgraph prunes history, so it can only serve the live run
      if (!fallback || timestamp !== null || pools.length >= fallback.minPools)
        return pools;

      const fallbackPools = await topLvlFallback(chain, fallback);
      return fallbackPools.length > pools.length ? fallbackPools : pools;
    }),
    ...Object.entries(dayDataChains).map(([chain, url]) =>
      topLvlDayData(chain, url)
    ),
  ]);

  return data
    .flat()
    .filter((p) => utils.keepFinite(p))
    .filter((p) => !hasSuspiciousTvlVolume(p));
};

module.exports = {
  protocolId: '5690',
  apy: main,
};
