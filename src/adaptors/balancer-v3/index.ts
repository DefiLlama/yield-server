const { gql, request } = require('graphql-request');
const utils = require('../utils');

const BALANCER_API_URL = 'https://api-v3.balancer.fi/graphql';
const SNAPSHOT_BATCH_SIZE = 35;
const SNAPSHOT_WINDOW_DAYS = 7;
const SNAPSHOT_MIN_TVL_USD = 10000;
const SNAPSHOT_MIN_VOLUME_USD_24H = 1;
const MAX_SNAPSHOT_POOLS_PER_CHAIN = 280;
const VOLUME_UNAVAILABLE_SENTINEL = { unavailable: true };
const API_MAX_RETRIES = 5;
const API_RETRY_DELAY_MS = 1500;
const API_MIN_REQUEST_INTERVAL_MS = 1200;
const DEFAULT_RATE_LIMIT_COOLDOWN_MS = 30000;
const REQUEST_HEADERS = {
  'content-type': 'application/json',
  accept: 'application/json',
  'user-agent': 'defillama-yield-server',
};

const query = gql`
  query GetPools($chain: GqlChain!) {
    poolGetPools(
      first: 1000
      where: { chainIn: [$chain], protocolVersionIn: [3] }
    ) {
      chain
      symbol
      address
      poolTokens {
        address
        symbol
      }
      dynamicData {
        totalLiquidity
        volume24h
        aprItems {
          type
          apr
          rewardTokenAddress
        }
      }
    }
  }
`;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toAddressString = (value) => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object' && typeof value.address === 'string')
    return value.address;
  return null;
};

const toStringArray = (values) => {
  if (!Array.isArray(values)) return [];
  return values.filter((value) => typeof value === 'string');
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let nextAllowedRequestAt = 0;
let globalRateLimitUntil = 0;

const isRateLimitedError = (error) => {
  const status = error?.response?.status;
  const response = error?.response || {};
  const message = `${error?.message || ''} ${response?.title || ''} ${
    response?.detail || ''
  }`.toLowerCase();

  return (
    status === 429 ||
    response?.error_code === 1015 ||
    response?.error_name === 'rate_limited' ||
    response?.error_category === 'rate_limit' ||
    message.includes('rate limit') ||
    message.includes('rate-limited')
  );
};

const getRetryAfterMs = (error, attempt) => {
  const retryAfterFromBody = Number(error?.response?.retry_after);
  const retryAfterFromHeader = Number(
    error?.response?.headers?.get?.('retry-after')
  );

  const retryAfterMs = Number.isFinite(retryAfterFromBody)
    ? retryAfterFromBody * 1000
    : Number.isFinite(retryAfterFromHeader)
    ? retryAfterFromHeader * 1000
    : 0;

  const backoffMs = API_RETRY_DELAY_MS * 2 ** attempt;
  const jitterMs = Math.floor(Math.random() * 500);
  return Math.max(retryAfterMs, backoffMs) + jitterMs;
};

const isRetryableError = (error) => {
  if (isRateLimitedError(error)) return true;
  if (error?.response?.retryable === true) return true;

  const retryableCodes = new Set([
    'ECONNRESET',
    'ETIMEDOUT',
    'ENOTFOUND',
    'EAI_AGAIN',
    'ECONNABORTED',
  ]);
  return retryableCodes.has(error?.code);
};

const requestWithRetry = async (
  query,
  variables,
  maxRetries = API_MAX_RETRIES
) => {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const waitUntil = Math.max(nextAllowedRequestAt, globalRateLimitUntil);
    const waitMs = waitUntil - Date.now();
    if (waitMs > 0) {
      await sleep(waitMs);
    }

    nextAllowedRequestAt = Date.now() + API_MIN_REQUEST_INTERVAL_MS;

    try {
      return await request(BALANCER_API_URL, query, variables, REQUEST_HEADERS);
    } catch (error) {
      lastError = error;
      if (isRateLimitedError(error)) {
        const retryMs = Math.max(
          getRetryAfterMs(error, attempt),
          DEFAULT_RATE_LIMIT_COOLDOWN_MS
        );
        globalRateLimitUntil = Math.max(globalRateLimitUntil, Date.now() + retryMs);
      }

      const retryable = isRetryableError(error);
      if (!retryable || attempt === maxRetries) break;
      await sleep(getRetryAfterMs(error, attempt));
    }
  }
  throw lastError;
};

const buildSnapshotsQuery = (poolIds) => {
  const aliasedFields = poolIds
    .map(
      (poolId, index) => `
      snapshot_${index}: poolGetSnapshots(
        chain: $chain
        id: "${poolId}"
        range: THIRTY_DAYS
      ) {
        timestamp
        volume24h
      }`
    )
    .join('\n');

  return gql`
    query GetPoolSnapshots($chain: GqlChain!) {
      ${aliasedFields}
    }
  `;
};

const getSnapshotsByPoolId = async (backendChain, poolIds) => {
  const snapshotsByPoolId = new Map();
  const batches = chunkArray(poolIds, SNAPSHOT_BATCH_SIZE);
  let stopFurtherRequests = false;

  for (const batch of batches) {
    if (stopFurtherRequests) {
      batch.forEach((poolId) => {
        snapshotsByPoolId.set(
          poolId.toLowerCase(),
          VOLUME_UNAVAILABLE_SENTINEL
        );
      });
      continue;
    }

    const snapshotsQuery = buildSnapshotsQuery(batch);
    try {
      const response = await requestWithRetry(snapshotsQuery, {
        chain: backendChain,
      });
      batch.forEach((poolId, index) => {
        const snapshots = Array.isArray(response[`snapshot_${index}`])
          ? response[`snapshot_${index}`]
          : [];
        snapshotsByPoolId.set(poolId.toLowerCase(), snapshots);
      });
    } catch (error) {
      console.error(
        `Error fetching Balancer V3 snapshots for ${backendChain} (batch size ${batch.length}):`,
        error
      );
      batch.forEach((poolId) => {
        snapshotsByPoolId.set(
          poolId.toLowerCase(),
          VOLUME_UNAVAILABLE_SENTINEL
        );
      });

      if (isRateLimitedError(error)) {
        // Stop sending snapshot requests on this chain once API starts rate-limiting.
        stopFurtherRequests = true;
      }
    }
  }

  return snapshotsByPoolId;
};

const getVolumeDataFromSnapshots = (snapshots) => {
  if (snapshots === VOLUME_UNAVAILABLE_SENTINEL) {
    return {
      volumeUsd1dFromSnapshots: undefined,
      volumeUsd7d: undefined,
    };
  }

  const sortedSnapshots = [...(snapshots || [])].sort(
    (a, b) => toNumber(b.timestamp) - toNumber(a.timestamp)
  );
  const dailyVolumes = sortedSnapshots
    .slice(0, SNAPSHOT_WINDOW_DAYS)
    .map((snapshot) => toNumber(snapshot.volume24h));

  return {
    volumeUsd1dFromSnapshots: dailyVolumes[0] ?? 0,
    volumeUsd7d: dailyVolumes.reduce((sum, volume) => sum + volume, 0),
  };
};

const shouldFetchSnapshotsForPool = (pool) => {
  const dynamicData = pool?.dynamicData || {};
  return (
    toNumber(dynamicData.totalLiquidity) >= SNAPSHOT_MIN_TVL_USD &&
    toNumber(dynamicData.volume24h) >= SNAPSHOT_MIN_VOLUME_USD_24H
  );
};

const getV3Pools = async (backendChain, chainString) => {
  try {
    const { poolGetPools } = await requestWithRetry(query, {
      chain: backendChain,
    });
    const pools = Array.isArray(poolGetPools) ? poolGetPools : [];

    const snapshotEligiblePools = pools
      .filter((pool) => pool?.address && shouldFetchSnapshotsForPool(pool))
      .sort(
        (a, b) =>
          toNumber(b?.dynamicData?.volume24h) - toNumber(a?.dynamicData?.volume24h)
      )
      .slice(0, MAX_SNAPSHOT_POOLS_PER_CHAIN);

    const poolIds = snapshotEligiblePools
      .map((pool) => pool.address?.toLowerCase())
      .filter(Boolean);
    const snapshotsByPoolId = await getSnapshotsByPoolId(backendChain, poolIds);

    const chainUrl =
      chainString === 'xdai'
        ? 'gnosis'
        : chainString === 'avax'
        ? 'avalanche'
        : chainString;

    return pools.flatMap((pool) => {
      try {
        if (!pool?.address) return [];
        const dynamicData = pool.dynamicData || {};
        const aprItems = Array.isArray(dynamicData.aprItems)
          ? dynamicData.aprItems
          : [];

        const baseApr = aprItems
          .filter(
            (item) => item.type === 'IB_YIELD' || item.type === 'SWAP_FEE_24H'
          )
          .reduce((sum, item) => sum + Number(item.apr), 0);

        const stakingApr = aprItems
          .filter((item) => item.type === 'STAKING')
          .reduce((sum, item) => sum + Number(item.apr), 0);

        const rewardTokens = aprItems
          .filter((item) => item.type === 'STAKING' && item.rewardTokenAddress)
          .map((item) => toAddressString(item.rewardTokenAddress))
          .filter(Boolean);

        const underlyingTokens = (pool.poolTokens || [])
          .map((token) => toAddressString(token))
          .filter(Boolean);

        const poolId = pool.address.toLowerCase();
        const snapshots = snapshotsByPoolId.has(poolId)
          ? snapshotsByPoolId.get(poolId)
          : VOLUME_UNAVAILABLE_SENTINEL;
        const { volumeUsd1dFromSnapshots, volumeUsd7d } =
          getVolumeDataFromSnapshots(snapshots);
        const dynamicVolume24h = Number(dynamicData.volume24h);
        const poolData = {
          pool: pool.address,
          chain: utils.formatChain(chainString),
          project: 'balancer-v3',
          symbol: utils.formatSymbol(pool.symbol || ''),
          tvlUsd: toNumber(dynamicData.totalLiquidity),
          apyBase: Number.isFinite(baseApr) ? baseApr * 100 : 0,
          apyReward: Number.isFinite(stakingApr) ? stakingApr * 100 : 0,
          rewardTokens: toStringArray(rewardTokens),
          underlyingTokens: toStringArray(underlyingTokens),
          url: `https://balancer.fi/pools/${chainUrl}/v3/${pool.address}`,
        };

        if (Number.isFinite(dynamicVolume24h)) {
          poolData.volumeUsd1d = dynamicVolume24h;
        } else if (volumeUsd1dFromSnapshots !== undefined) {
          poolData.volumeUsd1d = volumeUsd1dFromSnapshots;
        }

        if (volumeUsd7d !== undefined) {
          poolData.volumeUsd7d = volumeUsd7d;
        }

        return [poolData];
      } catch (poolError) {
        console.error(
          `Skipping malformed Balancer V3 pool on ${chainString}:`,
          poolError?.message || poolError
        );
        return [];
      }
    });
  } catch (error) {
    console.error(
      `Error fetching Balancer V3 pools for ${chainString}:`,
      error
    );
    return [];
  }
};

const poolsFunction = async () => {
  const chainConfigs = [
    { backendChain: 'MAINNET', chainString: 'ethereum' },
    { backendChain: 'GNOSIS', chainString: 'xdai' },
    { backendChain: 'ARBITRUM', chainString: 'arbitrum' },
    { backendChain: 'OPTIMISM', chainString: 'optimism' },
    { backendChain: 'AVALANCHE', chainString: 'avax' },
    { backendChain: 'BASE', chainString: 'base' },
    { backendChain: 'HYPEREVM', chainString: 'hyperliquid' },
    { backendChain: 'PLASMA', chainString: 'plasma' },
    { backendChain: 'MONAD', chainString: 'monad' },
  ];

  const allPools = [];
  for (const { backendChain, chainString } of chainConfigs) {
    const pools = await getV3Pools(backendChain, chainString);
    allPools.push(...pools);
    await sleep(100);
  }

  return allPools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://balancer.fi/pools',
};
