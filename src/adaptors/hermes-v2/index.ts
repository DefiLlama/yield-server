const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const utils = require('../utils');

// ============================================================================
// CONFIGURATION
// ============================================================================

const CHAIN = 'arbitrum';
const PROJECT = 'hermes-v2';

// Contract Addresses on Arbitrum
const ADDRESSES = {
  // HERMES
  HERMES: '0x45940000009600102A1c002F0097C4A500fa00AB',

  // bHERMES
  bHERMES: '0x3A0000000000E1007cEb00351F65a1806eCd937C',

  // bHERMES-Gauges
  GAUGE_WEIGHT: '0xe6D0aeA7cEf79B08B906e0C455C25042b57b23Ed',

  // BaseV2Minter
  BASE_V2_MINTER: '0x000000B473F20DEA03618d00315900eC5900dc59',

  // UniswapV3Staker
  UNISWAP_V3_STAKER: '0x54De3b7b5D1993Db4B2a93C897b5272FBd60e99E',

  // FlywheelGaugeRewards
  FLYWHEEL_GAUGE_REWARDS: '0x000000b53E67c90000e1C22e1530c70020657Ff7',

  // Uniswap V3 NonfungiblePositionManager
  NFT_POSITION_MANAGER: '0xC36442b4a4522E871399CD717aBDD847Ab11FE88',
};

// Epoch timing
const WEEK_SECONDS = 7 * 24 * 60 * 60;
const YEAR_IN_SECONDS = 31_536_000;

// ============================================================================
// EPOCH CONTEXT
// ============================================================================

interface EpochContext {
  currentBlock: number;
  timestamp: number | null;
  epochStartTime: number; // from getIncentiveStartTime()
  epochEndTime: number; // from getIncentiveStartTime() + WEEK_SECONDS
  epochStartBlock: number;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Get incentive epoch start time for a given timestamp/block
 */
const getIncentiveStartTime = async (timestamp = null) => {
  const referenceTime = timestamp || Math.floor(Date.now() / 1000);

  return Math.trunc((referenceTime - 43200) / 604800) * 604800 + 43200;
};

/**
 * Build epoch context - compute shared epoch data once
 */
const getEpochContext = async (
  timestamp: number | null,
  currentBlock: number
): Promise<EpochContext> => {
  const epochStartTime = await getIncentiveStartTime(timestamp);
  const [epochStartBlock] = await utils.getBlocksByTime(
    [epochStartTime],
    CHAIN
  );

  const epochEndTime = epochStartTime + WEEK_SECONDS;

  return {
    currentBlock,
    timestamp,
    epochStartTime,
    epochEndTime,
    epochStartBlock,
  };
};

/**
 * Compute incentiveId from pool address and epoch start
 */
const computeIncentiveId = (poolAddress, epochStart) => {
  return ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['address', 'uint96'],
      [poolAddress, epochStart]
    )
  );
};

/**
 * Convert tick to sqrt price
 * Based on Uniswap V3 Math: price = 1.0001^tick, sqrtPrice = sqrt(price)
 */
const tickToSqrtPrice = (tick) => {
  return Math.sqrt(Math.pow(1.0001, tick));
};

/**
 * Calculate token amounts from liquidity and tick range
 */
const getAmountsFromLiquidity = (
  liquidity,
  tickLower,
  tickUpper,
  currentTick,
  decimals0,
  decimals1
) => {
  const currentPrice = tickToSqrtPrice(currentTick);
  const lowerPrice = tickToSqrtPrice(tickLower);
  const upperPrice = tickToSqrtPrice(tickUpper);

  let amount0, amount1;

  if (currentPrice < lowerPrice) {
    // Current price below range - all token0
    amount1 = 0;
    amount0 = liquidity * (1 / lowerPrice - 1 / upperPrice);
  } else if (lowerPrice <= currentPrice && currentPrice <= upperPrice) {
    // Current price in range - mixed
    amount1 = liquidity * (currentPrice - lowerPrice);
    amount0 = liquidity * (1 / currentPrice - 1 / upperPrice);
  } else {
    // Current price above range - all token1
    amount1 = liquidity * (upperPrice - lowerPrice);
    amount0 = 0;
  }

  // Apply decimals
  return [amount0 / 10 ** decimals0, amount1 / 10 ** decimals1];
};

/**
 * Get all gauge addresses from AddGauge events
 */
const getAllGauges = async (currentBlock) => {
  const addGaugeTopic = ethers.utils.id('AddGauge(address)');

  const logs = await sdk.api.util.getLogs({
    target: ADDRESSES.GAUGE_WEIGHT,
    topic: '',
    toBlock: currentBlock,
    fromBlock: 1,
    keys: [],
    chain: CHAIN,
    topics: [addGaugeTopic],
  });

  if (!logs.output || logs.output.length === 0) {
    return [];
  }

  // Extract gauge addresses from event topics
  return logs.output.map((log) => '0x' + log.topics[1].slice(-40));
};

/**
 * Get the pool address linked to a gauge
 */
const getGaugeInfo = async (gaugeAddress, block = null) => {
  try {
    const strategyResult = await sdk.api.abi.call({
      target: gaugeAddress,
      abi: 'function strategy() external view returns (address)',
      chain: CHAIN,
      block,
    });

    return {
      strategy: strategyResult.output,
    };
  } catch (e) {
    return null;
  }
};

/**
 * Get UniswapV3 pool info
 */
const getPoolInfo = async (poolAddress, block = null) => {
  try {
    const [token0Result, token1Result, feeResult, liquidityResult] =
      await Promise.all([
        sdk.api.abi.call({
          target: poolAddress,
          abi: 'function token0() external view returns (address)',
          chain: CHAIN,
          block,
        }),
        sdk.api.abi.call({
          target: poolAddress,
          abi: 'function token1() external view returns (address)',
          chain: CHAIN,
          block,
        }),
        sdk.api.abi.call({
          target: poolAddress,
          abi: 'function fee() external view returns (uint24)',
          chain: CHAIN,
          block,
        }),
        sdk.api.abi.call({
          target: poolAddress,
          abi: 'function liquidity() external view returns (uint128)',
          chain: CHAIN,
          block,
        }),
      ]);

    return {
      token0: token0Result.output,
      token1: token1Result.output,
      fee: feeResult.output,
      liquidity: liquidityResult.output,
    };
  } catch (e) {
    return null;
  }
};

/**
 * Get ERC20 token metadata
 */
const getTokenMetadata = async (tokenAddress, block = null) => {
  try {
    const [symbolResult, decimalsResult] = await Promise.all([
      sdk.api.abi.call({
        target: tokenAddress,
        abi: 'function symbol() external view returns (string)',
        chain: CHAIN,
        block,
      }),
      sdk.api.abi.call({
        target: tokenAddress,
        abi: 'function decimals() external view returns (uint8)',
        chain: CHAIN,
        block,
      }),
    ]);

    return {
      symbol: symbolResult.output,
      decimals: parseInt(decimalsResult.output),
    };
  } catch (e) {
    return { symbol: 'UNKNOWN', decimals: 18 };
  }
};

/**
 * Get staked token IDs for a pool by querying TokenStaked events
 */
const getStakedTokenIds = async (
  incentiveId: string,
  epochContext: EpochContext
) => {
  try {
    // Query TokenStaked events for this specific incentive
    const tokenStakedTopic = ethers.utils.id(
      'TokenStaked(uint256,bytes32,bool)'
    );
    const stakedLogs = await sdk.api.util.getLogs({
      target: ADDRESSES.UNISWAP_V3_STAKER,
      topic: '',
      toBlock: epochContext.currentBlock,
      fromBlock:
        epochContext.epochStartBlock > 0 ? epochContext.epochStartBlock : 1,
      keys: [],
      chain: CHAIN,
      topics: [tokenStakedTopic, null, incentiveId],
    });

    if (!stakedLogs.output || stakedLogs.output.length === 0) {
      return [];
    }

    // Extract and deduplicate staked tokenIds
    const tokenIds = stakedLogs.output.map((log) => BigInt(log.topics[1]));
    return [...new Set(tokenIds.map((id) => id.toString()))].map((id: string) =>
      BigInt(id)
    );
  } catch (e) {
    return [];
  }
};

/**
 * Get staked liquidity for a position from the staker contract
 */
const getStakedLiquidity = async (tokenId, incentiveId, block = null) => {
  try {
    const result = await sdk.api.abi.call({
      target: ADDRESSES.UNISWAP_V3_STAKER,
      abi: 'function stakes(uint256 tokenId, bytes32 incentiveId) external view returns (uint160 secondsPerLiquidityInsideInitialX128, uint128 liquidity)',
      params: [tokenId.toString(), incentiveId],
      chain: CHAIN,
      block,
    });

    return BigInt(result.output.liquidity || 0);
  } catch (e) {
    return 0n;
  }
};

/**
 * Get position info from NFT Position Manager
 */
const getPositionInfo = async (tokenId, block = null) => {
  try {
    const result = await sdk.api.abi.call({
      target: ADDRESSES.NFT_POSITION_MANAGER,
      abi: 'function positions(uint256 tokenId) external view returns (uint96 nonce, address operator, address token0, address token1, uint24 fee, int24 tickLower, int24 tickUpper, uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)',
      params: [tokenId.toString()],
      chain: CHAIN,
      block,
    });

    return {
      token0: result.output.token0,
      token1: result.output.token1,
      tickLower: parseInt(result.output.tickLower),
      tickUpper: parseInt(result.output.tickUpper),
      liquidity: BigInt(result.output.liquidity),
    };
  } catch (e) {
    return null;
  }
};

/**
 * Get pool slot0 data
 */
const getPoolSlot0 = async (poolAddress, block = null) => {
  try {
    const result = await sdk.api.abi.call({
      target: poolAddress,
      abi: 'function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)',
      chain: CHAIN,
      block,
    });

    return {
      sqrtPriceX96: BigInt(result.output.sqrtPriceX96),
      tick: parseInt(result.output.tick),
    };
  } catch (e) {
    return null;
  }
};

/**
 * Calculate staked TVL from staked positions
 */
const calculateStakedTvl = async (
  token0: string,
  token1: string,
  decimals0: number,
  decimals1: number,
  prices: Record<string, number>,
  slot0: { sqrtPriceX96: bigint; tick: number },
  incentiveId: string,
  epochContext: EpochContext
) => {
  try {
    // Get staked token IDs for this pool
    const tokenIds = await getStakedTokenIds(incentiveId, epochContext);

    if (tokenIds.length === 0) {
      return 0;
    }

    const price0 = prices[token0.toLowerCase()] || 0;
    const price1 = prices[token1.toLowerCase()] || 0;

    if (price0 === 0 && price1 === 0) return 0;

    let totalTvl = 0;

    // Calculate TVL from each staked position
    for (const tokenId of tokenIds) {
      // Get staked liquidity from staker contract
      const stakedLiquidity = await getStakedLiquidity(
        tokenId,
        incentiveId,
        epochContext.currentBlock
      );

      if (stakedLiquidity === 0n) continue;

      // Get position tick range from NFT manager
      const position = await getPositionInfo(
        tokenId,
        epochContext.currentBlock
      );
      if (!position) continue;

      // Calculate token amounts from liquidity
      const [amount0, amount1] = getAmountsFromLiquidity(
        Number(stakedLiquidity),
        position.tickLower,
        position.tickUpper,
        slot0.tick,
        decimals0,
        decimals1
      );

      // Add to TVL
      if (price0 > 0 && price1 > 0) {
        totalTvl += amount0 * price0 + amount1 * price1;
      } else if (price0 > 0) {
        totalTvl += amount0 * price0;
      } else if (price1 > 0) {
        totalTvl += amount1 * price1;
      }
    }

    return totalTvl;
  } catch (e) {
    console.error('Error calculating staked TVL:', e.message);
    return 0;
  }
};

/**
 * Get gauge weight allocation percentage
 * @dev this will be used for bHERMES gauge vote yield calculation, currently only used for display purposes
 */
const getGaugeAllocation = async (gaugeAddress, block = null) => {
  try {
    const [totalWeightResult, gaugeWeightResult] = await Promise.all([
      sdk.api.abi.call({
        target: ADDRESSES.GAUGE_WEIGHT,
        abi: 'function totalWeight() external view returns (uint256)',
        chain: CHAIN,
        block,
      }),
      sdk.api.abi.call({
        target: ADDRESSES.GAUGE_WEIGHT,
        abi: 'function getGaugeWeight(address) external view returns (uint256)',
        params: [gaugeAddress],
        chain: CHAIN,
        block,
      }),
    ]);

    const totalWeight = BigInt(totalWeightResult.output);
    const gaugeWeight = BigInt(gaugeWeightResult.output);

    if (totalWeight === 0n) return 0;

    // Return allocation as percentage
    return Number((gaugeWeight * 10000n) / totalWeight) / 100;
  } catch (e) {
    return 0;
  }
};

/**
 * Get incentive data from QueueRewards events on FlywheelGaugeRewards emitted at epoch start
 */
const getIncentiveFromEvents = async (
  incentiveId: string,
  epochContext: EpochContext
) => {
  try {
    const result = await sdk.api.abi.call({
      target: ADDRESSES.UNISWAP_V3_STAKER,
      abi: 'function incentives(bytes32 incentiveId) external view returns (uint256 totalRewardUnclaimed, uint160 totalSecondsClaimedX128, uint96 numberOfStakes)',
      params: [incentiveId],
      chain: CHAIN,
      block: epochContext.epochStartBlock,
    });

    const totalRewardUnclaimed = BigInt(
      result.output.totalRewardUnclaimed || 0
    );

    // Use epoch timing from context
    const endTime = epochContext.epochStartTime + WEEK_SECONDS;

    const reward = parseFloat(
      ethers.utils.formatUnits(totalRewardUnclaimed.toString(), 18)
    );

    return { startTime: epochContext.epochStartTime, endTime, reward };
  } catch (e) {
    console.error('Error getting incentive from events:', e.message);
    return null;
  }
};

/**
 * Fee tier to tick spacing mapping (copied from SDK)
 */
const feeTierToTickSpacing = (feeTier) => {
  if (feeTier == 100) return 1;
  if (feeTier == 500) return 10;
  if (feeTier == 3000) return 60;
  if (feeTier == 10000) return 200;
  return 60;
};

/**
 * Calculate position efficiency based on fee tier and minimum width
 * Efficiency ranges from ~1 (full range) to ~40,000 (single tick)
 * @dev extracted from https://github.com/Maia-DAO/sdks/blob/main/sdks/hermes-v2-sdk/src/utils/tvl.ts
 */
const positionEfficiency = (feeTier, minWidth) => {
  const tickSpacing = feeTierToTickSpacing(feeTier);
  const MAX_RANGE = 2 ** 20;

  // Get the larger of tick spacing or minWidth (rounded to tick spacing)
  const width = Math.max(
    tickSpacing,
    Math.ceil(minWidth / tickSpacing) * tickSpacing
  );

  // If width exceeds max range, treat as full range (efficiency = 1)
  if (width >= MAX_RANGE) {
    return 1;
  }

  // Calculate price ratio: Pa/Pb = 1.0001^(-width)
  const priceRatio = Math.pow(1.0001, -width);

  // efficiency = 1 / (1 - (Pa/Pb)^0.25)
  const efficiency = 1 / (1 - Math.pow(priceRatio, 0.25));

  return efficiency;
};

/**
 * Convert liquidity USD based on efficiency difference
 * @dev extracted from https://github.com/Maia-DAO/sdks/blob/main/sdks/hermes-v2-sdk/src/utils/tvl.ts
 */
const convertBasedOnEfficiency = (amount, feeTier, minWidth) => {
  const wideTicks = 6 * minWidth;

  const efficiencyAt0 = positionEfficiency(feeTier, 0);
  const efficiencyAtWide = positionEfficiency(feeTier, wideTicks);

  return (amount * efficiencyAt0) / efficiencyAtWide;
};
 
/**
 * Get minimumWidth from gauge contract
 */
const getGaugeMinimumWidth = async (gaugeAddress, feeTier, block = null) => {
  try {
    const result = await sdk.api.abi.call({
      target: gaugeAddress,
      abi: 'function minimumWidth() external view returns (uint24)',
      chain: CHAIN,
      block,
    });

    const minWdith = parseInt(result.output);
    const minSpacing = feeTierToTickSpacing(feeTier);

    // Ensure minimumWidth is at least tick spacing
    if (minWdith < minSpacing) {
      return minSpacing;
    }

    return minWdith;
  } catch (e) {
    // Default to 0 if not available
    return 0;
  }
};

/**
 * Calculate the USD value of liquidity at the current tick
 * @dev extracted from getAmountsCurrentTickUSD at https://github.com/Maia-DAO/sdks/blob/main/sdks/hermes-v2-sdk/src/utils/tvl.ts
 */
const getAmountsCurrentTickUSD = (
  sqrtPriceX96,
  tick,
  liquidity,
  feeTier,
  decimals0,
  decimals1,
  price0,
  price1
) => {
  if (!liquidity || liquidity === '0' || liquidity === 0n) return 0;

  const tickSpacing = feeTierToTickSpacing(feeTier);

  // Get tick bounds for current tick
  const tickLower = Math.floor(tick / tickSpacing) * tickSpacing;
  const tickUpper = tickLower + tickSpacing;

  // Convert sqrtPriceX96 to regular sqrtPrice
  const Q96 = BigInt(2) ** BigInt(96);
  const sqrtPrice = Number(sqrtPriceX96) / Number(Q96);

  // Calculate sqrtPrice at tick boundaries using Uniswap V3 formula
  const sqrtPriceLower = Math.sqrt(Math.pow(1.0001, tickLower));
  const sqrtPriceUpper = Math.sqrt(Math.pow(1.0001, tickUpper));

  // Calculate amounts using proper Uniswap V3
  const L = Number(liquidity);
  const amount0 = L * (1 / sqrtPrice - 1 / sqrtPriceUpper);
  const amount1 = L * (sqrtPrice - sqrtPriceLower);

  // Apply decimals and convert to USD
  const usdValue =
    (amount0 / 10 ** decimals0) * price0 + (amount1 / 10 ** decimals1) * price1;

  return usdValue;
};

/**
 * Calculate active liquidity USD for maximum APR calculation
 * @dev extracted from calculateLiquidityData formula for max APR at https://github.com/Maia-DAO/sdks/blob/main/sdks/hermes-v2-sdk/src/utils/calculateLiquidityData.ts
 */
const calculateActiveLiquidityUSD = async (
  gaugeAddress: string,
  poolInfo: { token0: string; token1: string; fee: string; liquidity: string },
  slot0: { sqrtPriceX96: bigint; tick: number },
  decimals0: number,
  decimals1: number,
  feeTier: number,
  prices: Record<string, number>,
  block: number | null = null
) => {
  try {
    const price0 = prices[poolInfo.token0.toLowerCase()] || 0;
    const price1 = prices[poolInfo.token1.toLowerCase()] || 0;

    if (price0 === 0 && price1 === 0) return 0;

    // Get current tick liquidity value in USD
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

    // If liquidity is 0, return minimum value
    if (currentTickLiquidityUSD <= 0) {
      return 1;
    }

    // Get minimumWidth from gauge contract
    const minWidth = await getGaugeMinimumWidth(gaugeAddress, feeTier, block);

    // Apply efficiency conversion based on minimumWidth
    const activeLiquidityUSD = convertBasedOnEfficiency(
      currentTickLiquidityUSD,
      feeTier,
      minWidth
    );

    return activeLiquidityUSD;
  } catch (e) {
    console.error('Error calculating active liquidity:', e.message);
    return 0;
  }
};

/**
 * Calculate APR from incentive reward
 */
const calculateAprReward = (
  reward,
  hermesPrice,
  activeLiquidityUSD,
  startTime,
  endTime,
  timestamp = null
) => {
  if (activeLiquidityUSD <= 0 || reward <= 0 || hermesPrice <= 0) {
    return 0;
  }

  // Use provided timestamp or current time
  const now = timestamp || Math.floor(Date.now() / 1000);

  // Check if incentive has ended
  if (now > endTime) {
    return 0;
  }

  const period = endTime - startTime;
  if (period <= 0) return 0;

  // apr = (rewardsUSD / liquidityUSD) * (YEAR / period) * 100
  const multiplier = (YEAR_IN_SECONDS / period) * 100;
  const rewardsUSD = reward * hermesPrice;
  const apr = (rewardsUSD / activeLiquidityUSD) * multiplier;

  return apr;
};

// ============================================================================
// MAIN ADAPTER FUNCTION
// ============================================================================

const getPools = async (timestamp = null) => {
  try {
    // Get block for the given timestamp (or latest if null)
    let currentBlock;
    if (timestamp) {
      [currentBlock] = await utils.getBlocksByTime([timestamp], CHAIN);
    } else {
      const latestBlock = await sdk.api.util.getLatestBlock(CHAIN);
      currentBlock = latestBlock.number;
    }

    // Compute epoch context
    const epochContext = await getEpochContext(timestamp, currentBlock);

    // Get all gauges from AddGauge events
    const gauges = await getAllGauges(currentBlock);

    if (gauges.length === 0) {
      console.log('No gauges found');
      return [];
    }

    // Collect all unique tokens for price fetching
    const tokenSet = new Set();
    tokenSet.add(ADDRESSES.HERMES); // Need HERMES price for APY calculation
    const gaugeData = [];

    // Get gauge and pool info, collect tokens
    for (const gaugeAddress of gauges) {
      const gaugeInfo = await getGaugeInfo(gaugeAddress, currentBlock);
      if (!gaugeInfo) continue;

      const poolInfo = await getPoolInfo(gaugeInfo.strategy, currentBlock);
      if (!poolInfo) continue;

      tokenSet.add(poolInfo.token0);
      tokenSet.add(poolInfo.token1);

      gaugeData.push({
        gaugeAddress,
        gaugeInfo,
        poolInfo,
        poolAddress: gaugeInfo.strategy,
      });
    }

    // Fetch all prices
    const tokens = Array.from(tokenSet);
    const prices = (await utils.getPrices(tokens, CHAIN, timestamp))
      .pricesByAddress;

    // Extract HERMES price
    const hermesPrice = prices[ADDRESSES.HERMES.toLowerCase()] || 0;

    const pools = [];
    for (const { gaugeAddress, poolInfo, poolAddress } of gaugeData) {
      try {
        // Get token metadata
        const [token0Meta, token1Meta] = await Promise.all([
          getTokenMetadata(poolInfo.token0, currentBlock),
          getTokenMetadata(poolInfo.token1, currentBlock),
        ]);

        // Get gauge allocation
        const allocation = await getGaugeAllocation(gaugeAddress, currentBlock);

        // Compute shared data for this pool
        const slot0 = await getPoolSlot0(poolAddress, currentBlock);
        const feeTier = parseInt(poolInfo.fee);
        const incentiveId = computeIncentiveId(
          poolAddress,
          epochContext.epochStartTime
        );

        // Get incentive data from QueueRewards events
        const incentiveData = await getIncentiveFromEvents(
          incentiveId,
          epochContext
        );

        // Calculate staked TVL
        let tvlUsd = 0;
        if (slot0 && incentiveData) {
          tvlUsd = await calculateStakedTvl(
            poolInfo.token0,
            poolInfo.token1,
            token0Meta.decimals,
            token1Meta.decimals,
            prices,
            slot0,
            incentiveId,
            epochContext
          );
        }

        // Calculate active liquidity USD for APR
        let activeLiquidityUSD = 0;
        if (slot0) {
          activeLiquidityUSD = await calculateActiveLiquidityUSD(
            gaugeAddress,
            poolInfo,
            slot0,
            token0Meta.decimals,
            token1Meta.decimals,
            feeTier,
            prices,
            currentBlock
          );
        }

        // Calculate APR
        let apyReward = null;
        if (incentiveData && activeLiquidityUSD > 0) {
          apyReward = calculateAprReward(
            incentiveData.reward,
            hermesPrice,
            activeLiquidityUSD,
            epochContext.epochStartTime,
            epochContext.epochEndTime,
            timestamp
          );
        }

        // Create pool symbol
        const poolSymbol = `${token0Meta.symbol}-${token1Meta.symbol}`;
        const feePercent = feeTier / 10000;

        pools.push({
          pool: `${gaugeAddress}-${CHAIN}`.toLowerCase(),
          chain: utils.formatChain(CHAIN),
          project: PROJECT,
          symbol: poolSymbol,
          tvlUsd,
          apyBase: 0,
          apyReward: apyReward && apyReward > 0 ? apyReward : null,
          rewardTokens: [ADDRESSES.HERMES],
          underlyingTokens: [poolInfo.token0, poolInfo.token1],
          poolMeta: `${feePercent}% fee, ${allocation.toFixed(
            2
          )}% gauge weight`,
          url: `https://app.maiadao.io/earn/${gaugeAddress}`,
        });
      } catch (e) {
        console.error(`Error processing gauge ${gaugeAddress}:`, e.message);
        continue;
      }
    }

    return pools;
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
