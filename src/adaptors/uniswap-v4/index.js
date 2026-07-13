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
    'CwpebM66AH5uqS5sreKij8yEkkPcHvmyEs7EwFtdM5ND'
  ),
  unichain: sdk.graph.modifyEndpoint(
    'aa3YpPCxatg4LaBbLFuv2iBC8Jvs9u3hwt5GTpS4Kit'
  ),
  bsc: sdk.graph.modifyEndpoint('2qQpC8inZPZL4tYfRQPFGZhsE8mYzE67n5z3Yf5uuKMu'),
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

const DYNAMIC_FEE_FLAG = 0x800000;
const PAGE_SIZE = 1000;
const TVL_MIN = 50000;
const SUSPECT_TVL_USD = 1e8;
const MIN_VOLUME_TO_TVL_RATIO = 1e-5;

const POOL_FIELDS = `
      id
      feeTier
      totalValueLockedUSD
      totalValueLockedToken0
      totalValueLockedToken1
      volumeUSD
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

const queryWithSkip = (skip) => gql`
  {
    pools(first: ${PAGE_SIZE}, skip: ${skip}, orderBy: totalValueLockedUSD, orderDirection: desc, where: {totalValueLockedUSD_gte: ${TVL_MIN}}, block: {number: <PLACEHOLDER>}) {${POOL_FIELDS}
    }
  }
`;

const fetchAllPools = async (url, block) => {
  let allPools = [];
  let skip = 0;

  while (true) {
    const q = queryWithSkip(skip).replace('<PLACEHOLDER>', block);
    const data = await request(url, q);
    if (!data.pools || data.pools.length === 0) break;
    allPools = allPools.concat(data.pools);
    if (data.pools.length < PAGE_SIZE) break;
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

const topLvl = async (chainString, url, timestamp) => {
  try {
    const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
      url,
    ]);

    let [dataNow, dataPrior] = await Promise.all([
      fetchAllPools(url, block),
      fetchAllPools(url, blockPrior),
    ]);

    dataNow = dataNow.map((p) => ({
      ...p,
      reserve0: p.totalValueLockedToken0,
      reserve1: p.totalValueLockedToken1,
    }));
    dataNow = dataNow.filter((p) => !hasInvalidTokenTvl(p));

    dataNow = await utils.tvl(dataNow, chainString);

    const dataPriorByPool = new Map(dataPrior.map((p) => [p.id, p]));

    dataNow = dataNow.map((pool) => {
      const poolPrior = dataPriorByPool.get(pool.id);
      const isDynamic = isDynamicFeePool(pool.feeTier);

      const volumeUSD1d =
        Number(pool.volumeUSD || 0) - Number(poolPrior?.volumeUSD || 0);

      // dynamic fee pools use hooks, can't calculate fees from feeTier
      const feeUSD1d = isDynamic
        ? 0
        : (volumeUSD1d * Number(pool.feeTier) || 0) / 1e6;

      const apy =
        pool.totalValueLockedUSD > 0 && feeUSD1d > 0
          ? (feeUSD1d * 365 * 100) / pool.totalValueLockedUSD
          : 0;

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

const latestPoolsQuery = (skip) => gql`
  {
    pools(first: ${PAGE_SIZE}, skip: ${skip}, orderBy: id, where: {totalValueLockedUSD_gte: ${TVL_MIN}}) {${POOL_FIELDS}
    }
  }
`;

const poolsByIdQuery = (ids) => gql`
  {
    pools(first: ${PAGE_SIZE}, where: {id_in: ${JSON.stringify(ids)}}) {${POOL_FIELDS}
    }
  }
`;

const dayVolumesQuery = (dateGte, dateLte, skip) => gql`
  {
    poolDayDatas(first: ${PAGE_SIZE}, skip: ${skip}, orderBy: id, where: {date_gte: ${dateGte}, date_lte: ${dateLte}}) {
      date
      volumeUSD
      pool {
        id
      }
    }
  }
`;

const fetchLatestPools = async (url) => {
  let allPools = [];

  for (let skip = 0; skip <= 5000; skip += PAGE_SIZE) {
    const data = await request(url, latestPoolsQuery(skip));
    allPools = allPools.concat(data.pools ?? []);
    if (!data.pools || data.pools.length < PAGE_SIZE) break;
  }

  return allPools;
};

// returns { poolId: { volumeUSD1d, volumeUSD7d } } built from the last 7 full
// days of poolDayDatas; the most recent full day supplies volumeUSD1d
const fetchDayVolumes = async (url, previousDay) => {
  const volumesByPoolId = {};
  const firstDay = previousDay - 6 * 86400;

  for (let skip = 0; skip <= 5000; skip += PAGE_SIZE) {
    const data = await request(url, dayVolumesQuery(firstDay, previousDay, skip));

    for (const dayData of data.poolDayDatas ?? []) {
      const poolId = dayData.pool.id;
      const volumes = volumesByPoolId[poolId] ?? {
        volumeUSD1d: 0,
        volumeUSD7d: 0,
      };

      volumes.volumeUSD7d += Number(dayData.volumeUSD);
      if (Number(dayData.date) === previousDay) {
        volumes.volumeUSD1d += Number(dayData.volumeUSD);
      }

      volumesByPoolId[poolId] = volumes;
    }

    if (!data.poolDayDatas || data.poolDayDatas.length < PAGE_SIZE) break;
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
      const data = await request(
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
      const volumeUSD1d = volumes?.volumeUSD1d ?? 0;
      const volumeUSD7d = volumes?.volumeUSD7d ?? 0;

      const feeRate = isDynamicFeePool(pool.feeTier)
        ? 0
        : Number(pool.feeTier) / 1e6;
      const feeUSD1d = volumeUSD1d * feeRate;
      const feeUSD7d = volumeUSD7d * feeRate;

      const toApy = (annualFeesUsd) =>
        pool.totalValueLockedUSD > 0 && annualFeesUsd > 0
          ? (annualFeesUsd * 100) / pool.totalValueLockedUSD
          : 0;

      return {
        ...formatPool(chainString, {
          ...pool,
          apyBase: toApy(feeUSD1d * 365),
          volumeUsd1d: volumeUSD1d,
        }),
        apyBase7d: toApy(feeUSD7d * 52),
        volumeUsd7d: volumeUSD7d,
      };
    });
  } catch (e) {
    console.log(chainString, e);
    return [];
  }
};

const main = async (timestamp = null) => {
  const data = await Promise.all([
    ...Object.entries(chains).map(([chain, url]) =>
      topLvl(chain, url, timestamp)
    ),
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
