const { gql, request } = require('graphql-request');
const utils = require('../utils');

const BALANCER_API_URL = 'https://api-v3.balancer.fi/graphql';
const SNAPSHOT_BATCH_SIZE = 25;
const SNAPSHOT_WINDOW_DAYS = 7;

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

const chunkArray = (items, size) => {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
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
    let response = {};
    try {
      response = await request(BALANCER_API_URL, snapshotsQuery, {
        chain: backendChain,
      });
    } catch (error) {
      console.error(
        `Error fetching Balancer V3 snapshots for ${backendChain}:`,
        error
      );
    }

    batch.forEach((poolId, index) => {
      const snapshots = Array.isArray(response[`snapshot_${index}`])
        ? response[`snapshot_${index}`]
        : [];
      snapshotsByPoolId.set(poolId.toLowerCase(), snapshots);
    });
  }

  return snapshotsByPoolId;
};

const getVolumeDataFromSnapshots = (snapshots) => {
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
    const { poolGetPools } = await request(
      BALANCER_API_URL,
      query,
      { chain: backendChain }
    );
    const poolIds = poolGetPools
      .map((pool) => pool.address?.toLowerCase())
      .filter(Boolean);
    const snapshotsByPoolId = await getSnapshotsByPoolId(backendChain, poolIds);

    return poolGetPools.map((pool) => {
      const aprItems = pool.dynamicData.aprItems || [];

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

      const underlyingTokens = pool.poolTokens
        .map((token) => token.address)
        .filter(Boolean);

      const chainUrl =
        chainString === 'xdai'
          ? 'gnosis'
          : chainString === 'avax'
          ? 'avalanche'
          : chainString;
      const poolId = pool.address?.toLowerCase();
      const { volumeUsd1dFromSnapshots, volumeUsd7d } = getVolumeDataFromSnapshots(
        snapshotsByPoolId.get(poolId) || []
      );
      const dynamicVolume24h = Number(pool.dynamicData?.volume24h);
      const volumeUsd1d = Number.isFinite(dynamicVolume24h)
        ? dynamicVolume24h
        : volumeUsd1dFromSnapshots;

      return {
        pool: pool.address,
        chain: utils.formatChain(chainString),
        project: 'balancer-v3',
        symbol: utils.formatSymbol(pool.symbol),
        tvlUsd: Number(pool.dynamicData.totalLiquidity),
        apyBase: baseApr * 100,
        apyReward: stakingApr * 100,
        rewardTokens: rewardTokens,
        underlyingTokens: underlyingTokens,
        volumeUsd1d,
        volumeUsd7d,
        url: `https://balancer.fi/pools/${chainUrl}/v3/${pool.address}`,
      };
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
  const [
    mainnetPools,
    gnosisPools,
    arbitrumPools,
    optimismPools,
    avalanchePools,
    basePools,
    hyperliquidPools,
    plasmaPools,
    monadPools,
  
  ] = await Promise.all([
    getV3Pools('MAINNET', 'ethereum'),
    getV3Pools('GNOSIS', 'xdai'),
    getV3Pools('ARBITRUM', 'arbitrum'),
    getV3Pools('OPTIMISM', 'optimism'),
    getV3Pools('AVALANCHE', 'avax'),
    getV3Pools('BASE', 'base'),
    getV3Pools('HYPEREVM', 'hyperliquid'),
    getV3Pools('PLASMA', 'plasma'),
    getV3Pools('MONAD', 'monad'),
  ]);

  return [
    ...mainnetPools,
    ...gnosisPools,
    ...arbitrumPools,
    ...optimismPools,
    ...avalanchePools,
    ...basePools,
    ...hyperliquidPools,
    ...plasmaPools,
    ...monadPools,
  ];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://balancer.fi/pools',
};
