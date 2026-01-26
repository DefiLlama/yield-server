const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const utils = require('../utils');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CHAIN = 'arbitrum';
const PROJECT = 'hermes-v2';

// Deployment block for efficient event queries
const DEPLOYMENT_BLOCK = 140000000;

const EVENTS = {
  AddGauge: 'event AddGauge(address indexed gauge)',
  TokenStaked:
    'event TokenStaked(uint256 indexed tokenId, bytes32 indexed incentiveId, bool isRestake)',
};

// Contract Addresses on Arbitrum
const ADDRESSES = {
  HERMES: '0x45940000009600102A1c002F0097C4A500fa00AB',
  bHERMES: '0x3A0000000000E1007cEb00351F65a1806eCd937C',
  GAUGE_WEIGHT: '0xe6D0aeA7cEf79B08B906e0C455C25042b57b23Ed',
  BASE_V2_MINTER: '0x000000B473F20DEA03618d00315900eC5900dc59',
  UNISWAP_V3_STAKER: '0x54De3b7b5D1993Db4B2a93C897b5272FBd60e99E',
  FLYWHEEL_GAUGE_REWARDS: '0x000000b53E67c90000e1C22e1530c70020657Ff7',
  NFT_POSITION_MANAGER: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
};

// Epoch timing
const WEEK_SECONDS = 7 * 24 * 60 * 60;
const YEAR_IN_SECONDS = 31_536_000;

// ============================================================================
// TYPES
// ============================================================================

interface EpochContext {
  currentBlock: number;
  timestamp: number | null;
  epochStartTime: number;
  epochEndTime: number;
  epochStartBlock: number;
}

interface GaugeData {
  gaugeAddress: string;
  poolAddress: string;
  token0: string;
  token1: string;
  fee: string;
  liquidity: string;
}

interface TokenMetadata {
  symbol: string;
  decimals: number;
}

// ============================================================================
// CACHES
// ============================================================================

const tokenMetadataCache = new Map<string, TokenMetadata>();

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get incentive epoch start time for a given timestamp
 */
const getIncentiveStartTime = (timestamp: number | null = null): number => {
  const referenceTime = timestamp || Math.floor(Date.now() / 1000);
  return Math.trunc((referenceTime - 43200) / 604800) * 604800 + 43200;
};

/**
 * Build epoch context
 */
const getEpochContext = async (
  timestamp: number | null,
  currentBlock: number
): Promise<EpochContext> => {
  const epochStartTime = getIncentiveStartTime(timestamp);
  const [epochStartBlock] = await utils.getBlocksByTime([epochStartTime], CHAIN);

  return {
    currentBlock,
    timestamp,
    epochStartTime,
    epochEndTime: epochStartTime + WEEK_SECONDS,
    epochStartBlock,
  };
};

/**
 * Compute incentiveId from pool address and epoch start
 */
const computeIncentiveId = (poolAddress: string, epochStart: number): string => {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['address', 'uint96'],
      [poolAddress, epochStart]
    )
  );
};

/**
 * Fee tier to tick spacing mapping
 */
const feeTierToTickSpacing = (feeTier: number): number => {
  if (feeTier === 100) return 1;
  if (feeTier === 500) return 10;
  if (feeTier === 3000) return 60;
  if (feeTier === 10000) return 200;
  return 60;
};

/**
 * Calculate position efficiency based on fee tier and minimum width
 */
const positionEfficiency = (feeTier: number, minWidth: number): number => {
  const tickSpacing = feeTierToTickSpacing(feeTier);
  const MAX_RANGE = 2 ** 20;

  const width = Math.max(
    tickSpacing,
    Math.ceil(minWidth / tickSpacing) * tickSpacing
  );

  if (width >= MAX_RANGE) return 1;

  const priceRatio = Math.pow(1.0001, -width);
  return 1 / (1 - Math.pow(priceRatio, 0.25));
};

/**
 * Convert liquidity USD based on efficiency difference
 */
const convertBasedOnEfficiency = (
  amount: number,
  feeTier: number,
  minWidth: number
): number => {
  const wideTicks = 6 * minWidth;
  const efficiencyAt0 = positionEfficiency(feeTier, 0);
  const efficiencyAtWide = positionEfficiency(feeTier, wideTicks);
  return (amount * efficiencyAt0) / efficiencyAtWide;
};

/**
 * Calculate the USD value of liquidity at the current tick
 */
const getAmountsCurrentTickUSD = (
  sqrtPriceX96: bigint,
  tick: number,
  liquidity: string,
  feeTier: number,
  decimals0: number,
  decimals1: number,
  price0: number,
  price1: number
): number => {
  if (!liquidity || liquidity === '0') return 0;

  const tickSpacing = feeTierToTickSpacing(feeTier);
  const tickLower = Math.floor(tick / tickSpacing) * tickSpacing;
  const tickUpper = tickLower + tickSpacing;

  const Q96 = BigInt(2) ** BigInt(96);
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);
  const sqrtPriceLower = Math.sqrt(Math.pow(1.0001, tickLower));
  const sqrtPriceUpper = Math.sqrt(Math.pow(1.0001, tickUpper));

  const L = Number(liquidity);
  const amount0 = L * (1 / sqrtPrice - 1 / sqrtPriceUpper);
  const amount1 = L * (sqrtPrice - sqrtPriceLower);

  return (
    (amount0 / 10 ** decimals0) * price0 + (amount1 / 10 ** decimals1) * price1
  );
};

// ============================================================================
// BATCHED DATA FETCHING
// ============================================================================

/**
 * Get all gauge addresses from AddGauge events
 */
const getAllGauges = async (currentBlock: number): Promise<string[]> => {
  const logs = await sdk.getEventLogs({
    target: ADDRESSES.GAUGE_WEIGHT,
    eventAbi: EVENTS.AddGauge,
    fromBlock: DEPLOYMENT_BLOCK,
    toBlock: currentBlock,
    chain: CHAIN,
  });

  if (!logs || logs.length === 0) return [];
  return logs.map((log: any) => log.args.gauge);
};

/**
 * Batch fetch gauge strategies (pool addresses)
 */
const batchGetGaugeStrategies = async (
  gauges: string[],
  block: number | null
): Promise<Map<string, string>> => {
  const results = await sdk.api.abi.multiCall({
    calls: gauges.map((gauge) => ({ target: gauge })),
    abi: 'function strategy() external view returns (address)',
    chain: CHAIN,
    block,
    permitFailure: true,
  });

  const strategyMap = new Map<string, string>();
  results.output.forEach((result: any, i: number) => {
    if (result.success && result.output) {
      strategyMap.set(gauges[i], result.output);
    }
  });

  return strategyMap;
};

/**
 * Batch fetch pool info (token0, token1, fee, liquidity)
 */
const batchGetPoolInfo = async (
  pools: string[],
  block: number | null
): Promise<Map<string, { token0: string; token1: string; fee: string; liquidity: string }>> => {
  const [token0Results, token1Results, feeResults, liquidityResults] =
    await Promise.all([
      sdk.api.abi.multiCall({
        calls: pools.map((pool) => ({ target: pool })),
        abi: 'function token0() external view returns (address)',
        chain: CHAIN,
        block,
        permitFailure: true,
      }),
      sdk.api.abi.multiCall({
        calls: pools.map((pool) => ({ target: pool })),
        abi: 'function token1() external view returns (address)',
        chain: CHAIN,
        block,
        permitFailure: true,
      }),
      sdk.api.abi.multiCall({
        calls: pools.map((pool) => ({ target: pool })),
        abi: 'function fee() external view returns (uint24)',
        chain: CHAIN,
        block,
        permitFailure: true,
      }),
      sdk.api.abi.multiCall({
        calls: pools.map((pool) => ({ target: pool })),
        abi: 'function liquidity() external view returns (uint128)',
        chain: CHAIN,
        block,
        permitFailure: true,
      }),
    ]);

  const poolMap = new Map();
  pools.forEach((pool, i) => {
    if (
      token0Results.output[i].success &&
      token1Results.output[i].success &&
      feeResults.output[i].success &&
      liquidityResults.output[i].success
    ) {
      poolMap.set(pool, {
        token0: token0Results.output[i].output,
        token1: token1Results.output[i].output,
        fee: feeResults.output[i].output,
        liquidity: liquidityResults.output[i].output,
      });
    }
  });

  return poolMap;
};

/**
 * Batch fetch token metadata with caching
 */
const batchGetTokenMetadata = async (
  tokens: string[],
  block: number | null
): Promise<Map<string, TokenMetadata>> => {
  // Filter out already cached tokens
  const uncachedTokens = tokens.filter(
    (t) => !tokenMetadataCache.has(t.toLowerCase())
  );

  if (uncachedTokens.length > 0) {
    const [symbolResults, decimalsResults] = await Promise.all([
      sdk.api.abi.multiCall({
        calls: uncachedTokens.map((token) => ({ target: token })),
        abi: 'function symbol() external view returns (string)',
        chain: CHAIN,
        block,
        permitFailure: true,
      }),
      sdk.api.abi.multiCall({
        calls: uncachedTokens.map((token) => ({ target: token })),
        abi: 'function decimals() external view returns (uint8)',
        chain: CHAIN,
        block,
        permitFailure: true,
      }),
    ]);

    uncachedTokens.forEach((token, i) => {
      const symbol = symbolResults.output[i].success
        ? symbolResults.output[i].output
        : 'UNKNOWN';
      const decimals = decimalsResults.output[i].success
        ? parseInt(decimalsResults.output[i].output)
        : 18;
      tokenMetadataCache.set(token.toLowerCase(), { symbol, decimals });
    });
  }

  // Return all requested tokens from cache
  const result = new Map<string, TokenMetadata>();
  tokens.forEach((token) => {
    const cached = tokenMetadataCache.get(token.toLowerCase());
    if (cached) {
      result.set(token.toLowerCase(), cached);
    }
  });

  return result;
};

/**
 * Batch fetch pool slot0 data
 */
const batchGetPoolSlot0 = async (
  pools: string[],
  block: number | null
): Promise<Map<string, { sqrtPriceX96: bigint; tick: number }>> => {
  const results = await sdk.api.abi.multiCall({
    calls: pools.map((pool) => ({ target: pool })),
    abi: 'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
    chain: CHAIN,
    block,
    permitFailure: true,
  });

  const slot0Map = new Map();
  pools.forEach((pool, i) => {
    if (results.output[i].success) {
      slot0Map.set(pool, {
        sqrtPriceX96: BigInt(results.output[i].output.sqrtPriceX96),
        tick: parseInt(results.output[i].output.tick),
      });
    }
  });

  return slot0Map;
};

/**
 * Batch fetch gauge weights and total weight
 */
const batchGetGaugeWeights = async (
  gauges: string[],
  block: number | null
): Promise<{ weights: Map<string, bigint>; totalWeight: bigint }> => {
  const [totalWeightResult, gaugeWeightResults] = await Promise.all([
    sdk.api.abi.call({
      target: ADDRESSES.GAUGE_WEIGHT,
      abi: 'function totalWeight() external view returns (uint256)',
      chain: CHAIN,
      block,
    }),
    sdk.api.abi.multiCall({
      calls: gauges.map((gauge) => ({
        target: ADDRESSES.GAUGE_WEIGHT,
        params: [gauge],
      })),
      abi: 'function getGaugeWeight(address) external view returns (uint256)',
      chain: CHAIN,
      block,
      permitFailure: true,
    }),
  ]);

  const totalWeight = BigInt(totalWeightResult.output);
  const weights = new Map<string, bigint>();

  gauges.forEach((gauge, i) => {
    if (gaugeWeightResults.output[i].success) {
      weights.set(gauge, BigInt(gaugeWeightResults.output[i].output));
    }
  });

  return { weights, totalWeight };
};

/**
 * Batch fetch gauge minimum widths
 */
const batchGetGaugeMinWidths = async (
  gauges: string[],
  block: number | null
): Promise<Map<string, number>> => {
  const results = await sdk.api.abi.multiCall({
    calls: gauges.map((gauge) => ({ target: gauge })),
    abi: 'function minimumWidth() external view returns (uint24)',
    chain: CHAIN,
    block,
    permitFailure: true,
  });

  const minWidthMap = new Map<string, number>();
  gauges.forEach((gauge, i) => {
    minWidthMap.set(
      gauge,
      results.output[i].success ? parseInt(results.output[i].output) : 0
    );
  });

  return minWidthMap;
};

/**
 * Batch fetch incentive rewards at epoch start
 */
const batchGetIncentiveRewards = async (
  incentiveIds: string[],
  epochStartBlock: number
): Promise<Map<string, number>> => {
  const results = await sdk.api.abi.multiCall({
    calls: incentiveIds.map((id) => ({
      target: ADDRESSES.UNISWAP_V3_STAKER,
      params: [id],
    })),
    abi: 'function incentives(bytes32 incentiveId) external view returns (uint256 totalRewardUnclaimed, uint160 totalSecondsClaimedX128, uint96 numberOfStakes)',
    chain: CHAIN,
    block: epochStartBlock,
    permitFailure: true,
  });

  const rewardMap = new Map<string, number>();
  incentiveIds.forEach((id, i) => {
    if (results.output[i].success) {
      const totalRewardUnclaimed = BigInt(
        results.output[i].output.totalRewardUnclaimed || 0
      );
      const reward = parseFloat(
        ethers.utils.formatUnits(totalRewardUnclaimed.toString(), 18)
      );
      rewardMap.set(id, reward);
    }
  });

  return rewardMap;
};

// ============================================================================
// TVL CALCULATION
// ============================================================================

/**
 * Calculate active liquidity USD for APR calculation
 * Uses on-chain pool liquidity - more accurate than tracking individual positions
 */
const calculateActiveLiquidityUSD = (
  poolInfo: { token0: string; token1: string; fee: string; liquidity: string },
  slot0: { sqrtPriceX96: bigint; tick: number },
  decimals0: number,
  decimals1: number,
  feeTier: number,
  minWidth: number,
  prices: Record<string, number>
): number => {
  const price0 = prices[poolInfo.token0.toLowerCase()] || 0;
  const price1 = prices[poolInfo.token1.toLowerCase()] || 0;

  if (price0 === 0 && price1 === 0) return 0;

  const currentTickLiquidityUSD = getAmountsCurrentTickUSD(
    slot0.sqrtPriceX96,
    slot0.tick,
    poolInfo.liquidity,
    feeTier,
    decimals0,
    decimals1,
    price0,
    price1
  );

  if (currentTickLiquidityUSD <= 0) return 1;

  // Apply efficiency conversion based on minimumWidth
  return convertBasedOnEfficiency(currentTickLiquidityUSD, feeTier, minWidth);
};

/**
 * Calculate APR from incentive reward
 */
const calculateAprReward = (
  reward: number,
  hermesPrice: number,
  activeLiquidityUSD: number,
  startTime: number,
  endTime: number,
  timestamp: number | null = null
): number => {
  if (activeLiquidityUSD <= 0 || reward <= 0 || hermesPrice <= 0) return 0;

  const now = timestamp || Math.floor(Date.now() / 1000);
  if (now > endTime) return 0;

  const period = endTime - startTime;
  if (period <= 0) return 0;

  const multiplier = (YEAR_IN_SECONDS / period) * 100;
  const rewardsUSD = reward * hermesPrice;
  return (rewardsUSD / activeLiquidityUSD) * multiplier;
};

// ============================================================================
// MAIN ADAPTER FUNCTION
// ============================================================================

const getPools = async (timestamp: number | null = null) => {
  try {
    // Get current block
    let currentBlock: number;
    if (timestamp) {
      [currentBlock] = await utils.getBlocksByTime([timestamp], CHAIN);
    } else {
      const latestBlock = await sdk.api.util.getLatestBlock(CHAIN);
      currentBlock = latestBlock.number;
    }

    // Build epoch context
    const epochContext = await getEpochContext(timestamp, currentBlock);

    // Get all gauges
    const gauges = await getAllGauges(currentBlock);
    if (gauges.length === 0) {
      console.log('No gauges found');
      return [];
    }

    // Batch fetch gauge strategies (pool addresses)
    const strategyMap = await batchGetGaugeStrategies(gauges, currentBlock);
    const validGauges = gauges.filter((g) => strategyMap.has(g));
    const pools = validGauges.map((g) => strategyMap.get(g)!);

    // Batch fetch pool info
    const poolInfoMap = await batchGetPoolInfo(pools, currentBlock);

    // Build gauge data and collect tokens
    const tokenSet = new Set<string>();
    tokenSet.add(ADDRESSES.HERMES);

    const gaugeDataList: GaugeData[] = [];
    validGauges.forEach((gaugeAddress) => {
      const poolAddress = strategyMap.get(gaugeAddress)!;
      const poolInfo = poolInfoMap.get(poolAddress);
      if (!poolInfo) return;

      tokenSet.add(poolInfo.token0);
      tokenSet.add(poolInfo.token1);

      gaugeDataList.push({
        gaugeAddress,
        poolAddress,
        ...poolInfo,
      });
    });

    if (gaugeDataList.length === 0) {
      console.log('No valid gauge/pool pairs found');
      return [];
    }

    // Batch fetch all remaining data in parallel
    const gaugeAddresses = gaugeDataList.map((g) => g.gaugeAddress);
    const poolAddresses = gaugeDataList.map((g) => g.poolAddress);
    const tokens = Array.from(tokenSet);

    // Compute incentive IDs
    const incentiveIds = poolAddresses.map((pool) =>
      computeIncentiveId(pool, epochContext.epochStartTime)
    );

    const [
      prices,
      tokenMetadata,
      slot0Map,
      { weights, totalWeight },
      minWidthMap,
      rewardMap,
    ] = await Promise.all([
      utils.getPrices(tokens, CHAIN, timestamp),
      batchGetTokenMetadata(tokens, currentBlock),
      batchGetPoolSlot0(poolAddresses, currentBlock),
      batchGetGaugeWeights(gaugeAddresses, currentBlock),
      batchGetGaugeMinWidths(gaugeAddresses, currentBlock),
      batchGetIncentiveRewards(incentiveIds, epochContext.epochStartBlock),
    ]);

    const pricesByAddress = prices.pricesByAddress;
    const hermesPrice = pricesByAddress[ADDRESSES.HERMES.toLowerCase()] || 0;

    // Build pool results
    const results = gaugeDataList.map((gaugeData, i) => {
      const { gaugeAddress, poolAddress, token0, token1, fee, liquidity } =
        gaugeData;
      const incentiveId = incentiveIds[i];

      const token0Meta = tokenMetadata.get(token0.toLowerCase()) || {
        symbol: 'UNKNOWN',
        decimals: 18,
      };
      const token1Meta = tokenMetadata.get(token1.toLowerCase()) || {
        symbol: 'UNKNOWN',
        decimals: 18,
      };

      const slot0 = slot0Map.get(poolAddress);
      const feeTier = parseInt(fee);
      const minWidth = minWidthMap.get(gaugeAddress) || 0;
      const effectiveMinWidth = Math.max(minWidth, feeTierToTickSpacing(feeTier));

      // Calculate gauge allocation percentage
      const gaugeWeight = weights.get(gaugeAddress) || 0n;
      const allocation =
        totalWeight > 0n
          ? Number((gaugeWeight * 10000n) / totalWeight) / 100
          : 0;

      // Calculate TVL using on-chain liquidity (more reliable than position tracking)
      let tvlUsd = 0;
      let activeLiquidityUSD = 0;

      if (slot0) {
        activeLiquidityUSD = calculateActiveLiquidityUSD(
          { token0, token1, fee, liquidity },
          slot0,
          token0Meta.decimals,
          token1Meta.decimals,
          feeTier,
          effectiveMinWidth,
          pricesByAddress
        );
        tvlUsd = activeLiquidityUSD;
      }

      // Calculate APR
      const reward = rewardMap.get(incentiveId) || 0;
      let apyReward: number | null = null;

      if (reward > 0 && activeLiquidityUSD > 0) {
        apyReward = calculateAprReward(
          reward,
          hermesPrice,
          activeLiquidityUSD,
          epochContext.epochStartTime,
          epochContext.epochEndTime,
          timestamp
        );
      }

      const poolSymbol = `${token0Meta.symbol}-${token1Meta.symbol}`;
      const feePercent = feeTier / 10000;

      return {
        pool: `${gaugeAddress}-${CHAIN}`.toLowerCase(),
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: poolSymbol,
        tvlUsd,
        apyBase: 0,
        apyReward: apyReward && apyReward > 0 ? apyReward : null,
        rewardTokens: [ADDRESSES.HERMES],
        underlyingTokens: [token0, token1],
        poolMeta: `${feePercent}% fee, ${allocation.toFixed(2)}% gauge weight`,
        url: `https://app.maiadao.io/earn/${gaugeAddress}`,
      };
    });

    return results.filter((p) => utils.keepFinite(p));
  } catch (e) {
    console.error('Error in getPools:', e);
    return [];
  }
};

// ============================================================================
// EXPORTS
// ============================================================================

module.exports = {
  timetravel: true,
  apy: getPools,
  url: 'https://app.maiadao.io',
};
