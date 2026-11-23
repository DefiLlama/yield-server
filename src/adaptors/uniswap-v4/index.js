const sdk = require('@defillama/sdk');
const { ethers } = require('ethers');
const _ = require('lodash');
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

// read from each subgraph's poolManagers entity; monad's was checked against
// the Swap logs of its known pool ids
const POOL_MANAGERS = {
  ethereum: '0x000000000004444c5dc75cB358380D2e3dE08A90',
  base: '0x498581ff718922c3f8e6a244956af099b2652b2b',
  arbitrum: '0x360e68faccca8ca495c1b759fd9eee466db9fb32',
  polygon: '0x67366782805870060151383f4bbff9dab53e5cd6',
  unichain: '0x1f98400000000000000000000000000000000004',
  bsc: '0x28e2ea090877bf75740558f6bfb36a5ffee9e9df',
  avax: '0x06380c0e0912312b5150364b9dc4542ba0dbbc85',
  optimism: '0x9a13f98cb987694c9f086b1f5eb990eea8264ec3',
  monad: '0x188d586ddcf52439676ca21a244753fa19f9ea8e',
};

// each one's poolManager() is the entry above
const STATE_VIEWS = {
  ethereum: '0x7ffe42c4a5deea5b0fec41c94c136cf115597227',
  base: '0xa3c0c9b65bad0b08107aa264b0f3db444b867a71',
  arbitrum: '0x76fd297e2d437cd7f76d50f01afe6160f86e9990',
  polygon: '0x5ea1bd7974c8a611cbab0bdcafcb1d9cc9b3ba5a',
  unichain: '0x86e8631a016f9068c3f085faf484ee3f5fdee8f2',
  bsc: '0xd13dd3d6e93f276fafc9db9e6bb47c1180aee0c4',
  avax: '0xc3c9e198c735a4b97e3e683f391ccbdd60b69286',
  optimism: '0xc18a3169788f4f75a170290584eca6395c75ecdb',
  monad: '0x77395f3b2e73ae90843717371294fa97cc419d64',
};

// Uniswap's ReservesLens, same address on every chain: a pool's liquidity
// principal. the subgraphs' reserves also keep every fee ever paid
const RESERVES_LENS = '0x0000001b173C3bbF3984D417d8614E3eed34865B';
const POOLS_PRINCIPAL_ABI =
  'function getPoolTVLBatch(address manager, tuple(address currency0, address currency1, uint24 fee, int24 tickSpacing, address hooks)[] keys) view returns (tuple(uint256 coreAmount0, uint256 coreAmount1, uint256 hookReserves0, uint256 hookReserves1, uint256 hookEffective0, uint256 hookEffective1, uint160 sqrtPriceX96, int24 tick, uint128 activeLiquidity, uint256 blockNumber, address statsProvider, uint16 hookPermissions, bool hasCustomAccounting, uint8 statsStatus)[])';
// the lens reads every tick bitmap word, ~33M gas at tick spacing 1 and less
// in proportion above it, so wider-spaced pools share a call
const poolsPerCall = (pool) =>
  _.clamp(Math.floor(Number(pool.tickSpacing) / 5), 1, 10);

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
    // a second, independently deployed subgraph (owner 0xabdc...) with the same
    // canonical poolIds and reserves (530/532 shared pools within 5% on
    // 2026-10-26), used for the pool list only when the one above fails. it
    // stores a hook pool's current fee in feeTier rather than the 0x800000 flag,
    // so the 7d leg, priced at feeTier, goes unmeasured when it is used
    backupUrl: sdk.graph.modifyEndpoint(
      'EzLH76FWsZUSBTfp2P6CV7cqN56e1rSt2uWtqtsUMEeb'
    ),
    poolManager: POOL_MANAGERS.ethereum,
    // a halted subgraph throws and yields nothing, but one that serves a badly
    // incomplete set is just as useless and would otherwise pass a >0 check.
    // healthy runs return ~480 pools here, so anything near this floor is broken
    minPools: 100,
  },
};

// third-party deployment, used when the one above returns nothing
const backupChains = {
  optimism: sdk.graph.modifyEndpoint(
    'Ab7CAcb1yPXUU2j9Bha1BPDHjE5QqUtjC3rPYyAyodJA'
  ),
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
const MAX_PRICE_DIVERGENCE = 2;

const POOL_FIELDS = `
      id
      feeTier
      sqrtPrice
      totalValueLockedUSD
      totalValueLockedToken0
      totalValueLockedToken1
      createdAtTimestamp
      tickSpacing
      hooks
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
const TVL_ORDERED_CHAINS = new Set(['polygon', 'optimism']);

// ~39k base pools clear TVL_MIN on the subgraph's own prices with a single tx
// and zero liquidity, spam whose tokens cost ~750 price requests. requiring a
// second tx drops them without losing a priced pool on any chain (measured
// 2026-10-26)
const POOL_WHERE = `totalValueLockedUSD_gte: ${TVL_MIN}, txCount_gt: 1`;

// few base pools pass POOL_WHERE, so filling a 1000-row page scans most of the
// table and hits the gateway's 15s timeout (reported as an indexer
// BadResponse); 200-row pages take ~4s
const POOL_PAGE_SIZE = 200;

const queryWithSkip = (skip) => gql`
  {
    pools(first: ${POOL_PAGE_SIZE}, skip: ${skip}, orderBy: totalValueLockedUSD, orderDirection: desc, where: {${POOL_WHERE}}, block: {number: <PLACEHOLDER>}) {${POOL_FIELDS}
    }
  }
`;

const queryWithCursor = (idCursor, block) => gql`
  {
    pools(first: ${POOL_PAGE_SIZE}, orderBy: id, orderDirection: asc, where: {${POOL_WHERE}, id_gt: "${idCursor}"}, block: {number: ${block}}) {${POOL_FIELDS}
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
    if (page.length < POOL_PAGE_SIZE) break;
    skip += POOL_PAGE_SIZE;
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
    const feePercent = (Number(p.lpFee ?? p.feeTier) / 1e4).toFixed(2);
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

const poolIdOf = (poolKey) =>
  ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['address', 'address', 'uint24', 'int24', 'address'],
      poolKey
    )
  );

// a static pool's key carries its lp fee, a dynamic one the flag; the right one
// hashes back to the pool id
const poolKeyOf = (pool, lpFee) => {
  const keyWithFee = (fee) => [
    pool.token0.id,
    pool.token1.id,
    fee,
    Number(pool.tickSpacing),
    pool.hooks,
  ];
  const fee = [lpFee, DYNAMIC_FEE_FLAG].find(
    (candidate) => poolIdOf(keyWithFee(candidate)) === pool.id.toLowerCase()
  );
  return fee === undefined ? undefined : keyWithFee(fee);
};

// one pool the lens reverts on fails its whole call, so a failed call is read
// again a pool at a time
const readPrincipal = (chainString, pools) =>
  sdk.api.abi
    .call({
      chain: chainString,
      target: RESERVES_LENS,
      abi: POOLS_PRINCIPAL_ABI,
      params: [POOL_MANAGERS[chainString], pools.map((pool) => pool.poolKey)],
    })
    .then(({ output }) => output.map((amounts, i) => [pools[i].id, amounts]))
    .catch(async () =>
      pools.length === 1
        ? []
        : (
            await Promise.all(
              pools.map((pool) => readPrincipal(chainString, [pool]))
            )
          ).flat()
    );

const fetchPrincipal = async (chainString, pools) =>
  Object.fromEntries(
    (
      await sdk.util.runInPromisePool({
        items: Object.values(_.groupBy(pools, poolsPerCall)).flatMap(
          (sameSize) => _.chunk(sameSize, poolsPerCall(sameSize[0]))
        ),
        concurrency: 10,
        processor: (sharingACall) => readPrincipal(chainString, sharingACall),
      })
    ).flat()
  );

// slot0 packs one 12-bit protocol fee per direction; take the larger. a pool
// whose principal read fails sits the run out rather than publish the
// subgraph's inflated reserves
const withOnChainState = async (chainString, pools) => {
  const { output: slot0s } = await sdk.api.abi.multiCall({
    chain: chainString,
    target: STATE_VIEWS[chainString],
    abi: 'function getSlot0(bytes32 poolId) view returns (uint160 sqrtPriceX96, int24 tick, uint24 protocolFee, uint24 lpFee)',
    calls: pools.map((pool) => ({ params: [pool.id] })),
    permitFailure: true,
  });
  const withFees = pools.map((pool, i) => {
    const slot0 = slot0s[i].output;
    if (!slot0) return pool;
    const lpFee = Number(slot0.lpFee);
    const protocolFee = Number(slot0.protocolFee);
    return {
      ...pool,
      lpFee,
      protocolFee: Math.max(protocolFee & 0xfff, protocolFee >> 12),
      poolKey: poolKeyOf(pool, lpFee),
    };
  });

  const principal = await fetchPrincipal(
    chainString,
    withFees.filter((pool) => pool.poolKey)
  );

  const unread = pools.length - Object.keys(principal).length;
  if (unread)
    console.error(
      `uniswap-v4: ${chainString} principal unread for ${unread}/${pools.length} pools, leaving them out of this run`
    );

  return withFees
    .filter((pool) => principal[pool.id])
    .map((pool) => {
      const amounts = principal[pool.id];
      return {
        ...pool,
        sqrtPrice: amounts.sqrtPriceX96,
        reserve0:
          Number(amounts.coreAmount0) / 10 ** Number(pool.token0.decimals),
        reserve1:
          Number(amounts.coreAmount1) / 10 ** Number(pool.token1.decimals),
      };
    });
};

// a swap pays the lp fee plus the protocol fee. the Swap logs and the
// subgraphs that store the last swap's fee in feeTier price a day's fees at
// that total; the older deployments (arbitrum, optimism) price them at the
// PoolKey's fee, which is the lp fee alone and must not be netted again
const protocolFeeInSubgraphFees = (pool) =>
  Number(pool.feeTier) === pool.lpFee ? 0 : pool.protocolFee;

const lpFeesUsd = (feesUsd, volumeUsd, protocolFee) =>
  feesUsd && protocolFee
    ? Math.max(0, feesUsd - (volumeUsd * protocolFee) / 1e6)
    : feesUsd;

const token1PerToken0 = (pool) =>
  (Number(pool.sqrtPrice) / 2 ** 96) ** 2 *
  10 ** (Number(pool.token0.decimals) - Number(pool.token1.decimals));

const isAtMarketPrice = (pool) => {
  if (pool.price0 === undefined || pool.price1 === undefined) return true;
  const divergence = (token1PerToken0(pool) * pool.price1) / pool.price0;
  return (
    divergence <= MAX_PRICE_DIVERGENCE && divergence >= 1 / MAX_PRICE_DIVERGENCE
  );
};

const withTvlAtCoinsPrices = (pool) => {
  const { price0, price1 } = pool;
  if (price0 === undefined && price1 === undefined) return pool;
  if (price0 !== undefined && price1 !== undefined)
    return {
      ...pool,
      totalValueLockedUSD:
        Number(pool.reserve0) * price0 + Number(pool.reserve1) * price1,
    };
  const [priced, unpriced] =
    price0 === undefined
      ? [
          Number(pool.reserve1) * price1,
          Number(pool.reserve0) * token1PerToken0(pool) * price1,
        ]
      : [
          Number(pool.reserve0) * price0,
          (Number(pool.reserve1) * price0) / token1PerToken0(pool),
        ];
  return { ...pool, totalValueLockedUSD: priced + Math.min(unpriced, priced) };
};

// >2x off the coins price ratio means nobody arbitrages the pool: a mispriced
// token (ANVL-USDT at $6M, 2026-10-27) or an abandoned pool. an unpriced side
// takes the pool's price, capped at the priced side, instead of utils.tvl's x2
// the subgraph reserves only shortlist the pools worth an on-chain read
const priceAboveTvlMin = async (pools, chainString, atHead = true) => {
  const aboveTvlMin = (pricedPools) =>
    pricedPools
      .map(withTvlAtCoinsPrices)
      .filter((pool) => pool.totalValueLockedUSD >= TVL_MIN);
  const shortlist = aboveTvlMin(
    (await utils.tvl(pools, chainString)).filter(isAtMarketPrice)
  );
  if (!atHead) return shortlist;
  return aboveTvlMin(await withOnChainState(chainString, shortlist));
};

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
        `pool_: {totalValueLockedUSD_gte: ${TVL_MIN}}`,
        block
      ),
    ]);

    dataNow = dataNow.map((p) => ({
      ...p,
      reserve0: p.totalValueLockedToken0,
      reserve1: p.totalValueLockedToken1,
    }));
    dataNow = dataNow.filter((p) => !hasInvalidTokenTvl(p));

    // fees and the principal are read at the current block
    dataNow = await priceAboveTvlMin(dataNow, chainString, timestamp === null);

    const hookFeesUsd = await fetchHookFeesUsd(
      chainString,
      dataNow,
      previousDay,
      volumesByPoolId
    );

    dataNow = dataNow.map((pool) => {
      const volumes = volumesByPoolId[pool.id];
      const hasFullDay = Number(pool.createdAtTimestamp || 0) <= previousDay;
      const volumeUSD1d = hasFullDay
        ? Number(volumes?.volumeUSD1d ?? 0)
        : undefined;
      const feeUSD1d = !hasFullDay
        ? undefined
        : lpFeesUsd(
            isDynamicFeePool(pool.feeTier)
              ? hookFeesUsd[pool.id]
              : Number(volumes?.feeUSD1d ?? 0),
            volumeUSD1d,
            protocolFeeInSubgraphFees(pool)
          );

      let apy;
      if (feeUSD1d === undefined) {
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

const dayVolumesQuery = (dateGte, dateLte, idCursor, poolFilter, block) => gql`
  {
    poolDayDatas(first: ${PAGE_SIZE}, orderBy: id, orderDirection: asc, where: {date_gte: ${dateGte}, date_lte: ${dateLte}, id_gt: "${idCursor}", ${poolFilter}}${
  block ? `, block: {number: ${block}}` : ''
}) {
      id
      date
      volumeUSD
      volumeToken0
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

// returns { poolId: { volumeUSD1d, volumeUSD7d, feeUSD1d, feeUSD7d,
// token0Volume1d } } built from the requested full days of poolDayDatas; the
// most recent full day supplies the 1d values. a pool filter reads pool state
// at the block, so pass the block the pool list was read at
const fetchDayVolumes = async (
  url,
  previousDay,
  days = 7,
  poolFilter = '',
  block
) => {
  const volumesByPoolId = {};
  const firstDay = previousDay - (days - 1) * 86400;
  let idCursor = '';

  while (true) {
    const data = await requestWithRetry(
      url,
      dayVolumesQuery(firstDay, previousDay, idCursor, poolFilter, block)
    );
    const page = data.poolDayDatas ?? [];

    for (const dayData of page) {
      const poolId = dayData.pool.id;
      const volumes = volumesByPoolId[poolId] ?? {
        volumeUSD1d: 0,
        volumeUSD7d: 0,
        feeUSD1d: 0,
        feeUSD7d: 0,
        token0Volume1d: 0,
      };

      volumes.volumeUSD7d += Number(dayData.volumeUSD);
      volumes.feeUSD7d += Number(dayData.feesUSD);
      if (Number(dayData.date) === previousDay) {
        volumes.volumeUSD1d += Number(dayData.volumeUSD);
        volumes.feeUSD1d += Number(dayData.feesUSD);
        volumes.token0Volume1d += Number(dayData.volumeToken0);
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

    dataNow = await priceAboveTvlMin(dataNow, chainString);
    const hookFeesUsd = await fetchHookFeesUsd(
      chainString,
      dataNow,
      previousDay,
      volumesByPoolId
    );

    return dataNow.map((pool) => {
      const volumes = volumesByPoolId[pool.id];
      const isDynamic = isDynamicFeePool(pool.feeTier);
      const hasFullDay = Number(pool.createdAtTimestamp || 0) <= previousDay;
      const hasFullWeek =
        Number(pool.createdAtTimestamp || 0) <= previousDay - 6 * 86400;
      const volumeUSD1d = hasFullDay
        ? Number(volumes?.volumeUSD1d ?? 0)
        : undefined;
      const volumeUSD7d = hasFullWeek
        ? Number(volumes?.volumeUSD7d ?? 0)
        : undefined;
      const feeUSD1d = !hasFullDay
        ? undefined
        : lpFeesUsd(
            isDynamic ? hookFeesUsd[pool.id] : Number(volumes?.feeUSD1d ?? 0),
            volumeUSD1d,
            protocolFeeInSubgraphFees(pool)
          );
      const feeUSD7d =
        hasFullWeek && !isDynamic
          ? lpFeesUsd(
              Number(volumes?.feeUSD7d ?? 0),
              volumeUSD7d,
              protocolFeeInSubgraphFees(pool)
            )
          : undefined;

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

// without the token0_/token1_ filters this subgraph intermittently fails the
// whole page with "Null value resolved for non-null field token1", even though
// every pool on it resolves both tokens when fetched by id
const fallbackPoolsQuery = (idCursor, feeField, sqrtPriceField) => gql`
  {
    pools(first: ${PAGE_SIZE}, orderBy: id, orderDirection: asc, where: {totalValueLockedUSD_gte: ${FALLBACK_PREFILTER_TVL}, id_gt: "${idCursor}", token0_: {decimals_gte: 0}, token1_: {decimals_gte: 0}}) {
      id
      feeTier: ${feeField}
      sqrtPrice: ${sqrtPriceField}
      totalValueLockedUSD
      totalValueLockedToken0
      totalValueLockedToken1
      createdAtTimestamp
      tickSpacing
      hooks
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

const fetchFallbackPools = async (url, feeField, sqrtPriceField) => {
  const allPools = [];
  let idCursor = '';

  while (true) {
    const data = await requestWithRetry(
      url,
      fallbackPoolsQuery(idCursor, feeField, sqrtPriceField)
    );
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
  toTimestamp,
  poolIds
) => {
  const [start, end] = await Promise.all([
    getBlockAt(chainString, fromTimestamp),
    getBlockAt(chainString, toTimestamp),
  ]);
  const blockPrior =
    start.timestamp < fromTimestamp ? start.block + 1 : start.block;
  const block = end.timestamp >= toTimestamp ? end.block - 1 : end.block;

  // indexer v2's default offset paging repeats ~35% of a day's swaps in place
  // of others; v4 and clientStreaming page by cursor and match rpc exactly, and
  // clientStreaming is also the fastest of them and filters by pool id server
  // side, one id per request: it answers a list of ids with HTTP 400 on
  // unichain (measured 2026-10-26, sdk 5.0.242). the rpc fallback can return a
  // chunk-boundary block twice, so logs are deduped
  const getSwapLogs = (poolId) =>
    sdk.getEventLogs({
      target: poolManager,
      chain: chainString,
      fromBlock: blockPrior,
      toBlock: block,
      eventAbi: SWAP_EVENT,
      entireLog: true,
      skipCache: true,
      clientStreaming: true,
      ...(poolId && { extraTopics: [poolId] }),
    });
  // a pool whose request fails is left out of the totals, which its caller
  // reads as missing logs, rather than discarding the pools that answered
  const logs = poolIds
    ? (await Promise.allSettled(poolIds.map(getSwapLogs))).flatMap((r, i) => {
        if (r.status === 'fulfilled') return r.value;
        console.error(
          `uniswap-v4: ${chainString} swap logs for ${poolIds[i]}`,
          r.reason?.message ?? r.reason
        );
        return [];
      })
    : await getSwapLogs();

  const seen = new Set();
  const totalsByPoolId = {};
  for (const { transactionHash, logIndex, index, args } of logs) {
    const logKey = `${transactionHash}-${logIndex ?? index}`;
    if (seen.has(logKey)) continue;
    seen.add(logKey);

    const poolId = args.id.toLowerCase();
    const amount0 = absolute(BigInt(args.amount0));
    const amount1 = absolute(BigInt(args.amount1));
    const totals = (totalsByPoolId[poolId] ??= {
      amount0: 0n,
      amount1: 0n,
      fees0: 0n,
      fees1: 0n,
    });
    totals.amount0 += amount0;
    totals.amount1 += amount1;
    totals.fees0 += (amount0 * BigInt(args.fee)) / 1000000n;
    totals.fees1 += (amount1 * BigInt(args.fee)) / 1000000n;
  }

  return totalsByPoolId;
};

// the subgraph prices a hook pool's fees at the dynamic-fee flag itself
// (0x800000 ppm, ~839% of volume). the Swap logs carry what each swap paid, so
// they set the fee rate and the subgraph supplies the volume. when the indexer
// can't serve, the rpc pool can answer an old range with only some of its logs
// and no error, and a subset of a hook's swaps can average a different fee than
// the day did, so a rate counts only once the logs add up to the subgraph's
// token0 volume. pools short of it are retried, keeping those already
// measured, then left unmeasured
const MIN_LOG_COVERAGE = 0.99;

const fetchHookFeesUsd = async (
  chainString,
  pools,
  previousDay,
  volumesByPoolId,
  attempts = 3,
  feesUsd = {}
) => {
  const pending = [];
  for (const pool of pools.filter((p) => isDynamicFeePool(p.feeTier))) {
    if (!volumesByPoolId[pool.id]?.volumeUSD1d) feesUsd[pool.id] = 0;
    else if (feesUsd[pool.id] === undefined) pending.push(pool);
  }
  if (!pending.length) return feesUsd;

  try {
    const totals = await fetchSwapTotals(
      chainString,
      POOL_MANAGERS[chainString],
      previousDay,
      previousDay + 86400,
      pending.map((pool) => pool.id)
    );
    for (const pool of pending) {
      const { volumeUSD1d, token0Volume1d } = volumesByPoolId[pool.id];
      const poolTotals = totals[pool.id.toLowerCase()];
      const logVolume0 =
        Number(poolTotals?.amount0 ?? 0n) / 10 ** Number(pool.token0.decimals);
      if (logVolume0 > 0 && logVolume0 >= MIN_LOG_COVERAGE * token0Volume1d)
        feesUsd[pool.id] =
          (volumeUSD1d * Number(poolTotals.fees0)) / Number(poolTotals.amount0);
    }
  } catch (e) {
    console.error(`uniswap-v4: ${chainString} hook pool fees`, e?.message ?? e);
  }

  return attempts === 1
    ? feesUsd
    : fetchHookFeesUsd(
        chainString,
        pools,
        previousDay,
        volumesByPoolId,
        attempts - 1,
        feesUsd
      );
};

const topLvlFallback = async (
  chainString,
  { url, backupUrl, poolManager }
) => {
  // snapshots only feed the 7d leg, so losing them costs that leg alone
  const withoutSnapshots = (e) => {
    console.error(
      `uniswap-v4: ${chainString} fallback snapshots`,
      e?.message ?? e
    );
    return {};
  };
  try {
    const today = Math.floor(Date.now() / 1000 / 86400);
    const previousDay = (today - 1) * 86400;
    let usedBackup = false;
    const [pools, swapTotals, endOfYesterday, endOfDayBefore, endOfWeekBefore] =
      await Promise.all([
        fetchFallbackPools(url, 'fee', 'sqrtPriceX96').catch((e) => {
          console.error(
            `uniswap-v4: ${chainString} fallback pools, using backup`,
            e?.message ?? e
          );
          usedBackup = true;
          return fetchFallbackPools(backupUrl, 'feeTier', 'sqrtPrice');
        }),
        fetchSwapTotals(chainString, poolManager, previousDay, today * 86400),
        fetchCumulativeVolumes(url, today - 1).catch(withoutSnapshots),
        fetchCumulativeVolumes(url, today - 2).catch(withoutSnapshots),
        fetchCumulativeVolumes(url, today - 8).catch(withoutSnapshots),
      ]);

    let dataNow = pools
      .filter((pool) => !hasInvalidTokenTvl(pool))
      .map((pool) => ({
        ...pool,
        reserve0: pool.totalValueLockedToken0,
        reserve1: pool.totalValueLockedToken1,
      }));

    dataNow = await priceAboveTvlMin(dataNow, chainString);

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
        ? lpFeesUsd(
            (totals &&
              (toUsd(totals.fees0, pool.token0, pool.price0) ??
                toUsd(totals.fees1, pool.token1, pool.price1))) ||
              0,
            volumeUSD1d,
            pool.protocolFee
          )
        : undefined;

      // snapshot volume is priced by this subgraph, which gets some tokens badly
      // wrong (WBTC at ~8x on 2026-10-26), so a pool's 7d figure is trusted only
      // where its snapshots matched the swap logs within 25% yesterday
      const snapshotVolume1d =
        endOfYesterday[pool.id] - endOfDayBefore[pool.id];
      const snapshotsAgree =
        Math.abs(snapshotVolume1d - volumeUSD1d) <=
        0.25 * Math.max(snapshotVolume1d, volumeUSD1d);
      // a pool younger than the window, or one absent from either bucket, has no
      // measurable 7d span -- distinct from a pool that spanned it and traded 0
      const volumeUSD7d =
        !usedBackup && snapshotsAgree && endOfWeekBefore[pool.id] !== undefined
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
      // its fees include the protocol fee, which is only netted at the current block
      const backup = backupChains[chain];
      if (backup && !pools.length && timestamp === null)
        return topLvl(chain, backup, timestamp);

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
