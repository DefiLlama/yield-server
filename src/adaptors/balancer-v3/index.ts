const { gql, request } = require('graphql-request');
const utils = require('../utils');

const BALANCER_API_URLS = [
  'https://api-v3.balancer.fi/graphql',
  'https://api-v3.balancer.fi',
];
const SNAPSHOT_BATCH_SIZE = 20;
const SNAPSHOT_WINDOW_DAYS = 7;
const VOLUME_UNAVAILABLE_SENTINEL = { unavailable: true };
const API_MAX_RETRIES = 2;
const API_RETRY_DELAY_MS = 600;
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

const fallbackQuery = gql`
  query GetPoolsFallback($chain: GqlChain!) {
    poolGetPools(
      first: 1000
      where: { chainIn: [$chain], protocolVersionIn: [3] }
    ) {
      symbol
      address
      dynamicData {
        totalLiquidity
        volume24h
      }
    }
  }
`;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const requestWithRetry = async (
  query,
  variables,
  maxRetries = API_MAX_RETRIES
) => {
  let lastError;
  for (const apiUrl of BALANCER_API_URLS) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await request(apiUrl, query, variables, REQUEST_HEADERS);
      } catch (error) {
        lastError = error;
        if (attempt === maxRetries) break;
        await sleep(API_RETRY_DELAY_MS * (attempt + 1));
      }
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

  for (const batch of batches) {
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

const getV3Pools = async (backendChain, chainString) => {
  try {
    let pools = [];
    try {
      const { poolGetPools } = await requestWithRetry(query, {
        chain: backendChain,
      });
      pools = Array.isArray(poolGetPools) ? poolGetPools : [];
    } catch (fullQueryError) {
      console.error(
        `Balancer V3 full query failed on ${chainString}, retrying with fallback query:`,
        fullQueryError?.message || fullQueryError
      );
      const { poolGetPools } = await requestWithRetry(fallbackQuery, {
        chain: backendChain,
      });
      pools = Array.isArray(poolGetPools) ? poolGetPools : [];
    }

    const poolIds = pools
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
          .map((item) => item.rewardTokenAddress);

        const underlyingTokens = (pool.poolTokens || [])
          .map((token) => token?.address)
          .filter(Boolean);

        const poolId = pool.address.toLowerCase();
        const { volumeUsd1dFromSnapshots, volumeUsd7d } =
          getVolumeDataFromSnapshots(snapshotsByPoolId.get(poolId) || []);
        const dynamicVolume24h = Number(dynamicData.volume24h);
        const poolData = {
          pool: pool.address,
          chain: utils.formatChain(chainString),
          project: 'balancer-v3',
          symbol: utils.formatSymbol(pool.symbol || ''),
          tvlUsd: toNumber(dynamicData.totalLiquidity),
          apyBase: Number.isFinite(baseApr) ? baseApr * 100 : 0,
          apyReward: Number.isFinite(stakingApr) ? stakingApr * 100 : 0,
          rewardTokens: rewardTokens,
          underlyingTokens: underlyingTokens,
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
