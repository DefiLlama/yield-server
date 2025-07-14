const sdk = require('@defillama/sdk');
const axios = require('axios');

const poolAbi = require('./poolAbi');
const incentiveDataAbi = require('./incentiveDataAbi');

const protocolDataProvider = '0x2148e6253b23122Ee78B3fa6DcdDbefae426EB78';
const incentiveDataProvider = '0x7b589494de15C30FBBA49B2b478cBEcC561f5A87';
const provider = '0x1830a96466d1d108935865c75B0a9548681Cfd9A';

const apy = async () => {
  const chain = 'flow';

  const getReservesDataAbi = poolAbi.find((m) => m.name === 'getReservesData');
  const reservesData = await sdk.api.abi.call({
    target: protocolDataProvider,
    abi: getReservesDataAbi,
    params: [provider],
    chain,
  });

  const reserves = reservesData.output?.[0] || [];
  if (reserves.length === 0) return [];

  // Get incentive data
  let incentivesData = [];
  try {
    const getReservesIncentivesDataAbi = incentiveDataAbi.find(
      (m) => m.name === 'getReservesIncentivesData'
    );
    const incentivesResult = await sdk.api.abi.call({
      target: incentiveDataProvider,
      abi: getReservesIncentivesDataAbi,
      params: [provider],
      chain,
    });
    incentivesData = incentivesResult.output || [];
  } catch (error) {
    // Continue without incentive data if unavailable
  }

  // Get token prices
  const underlyingTokens = reserves.map((reserve) => reserve.underlyingAsset);
  const priceKeys = underlyingTokens
    .map((tokenAddress) => `${chain}:${tokenAddress}`)
    .join(',');
  const prices = (
    await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  ).data.coins;

  // Helper function to calculate reward APY
  const calculateRewardAPY = (
    incentiveData,
    totalSupplyOrBorrow,
    underlyingTokenPrice,
    underlyingDecimals
  ) => {
    if (
      !incentiveData ||
      !incentiveData.rewardsTokenInformation ||
      incentiveData.rewardsTokenInformation.length === 0
    ) {
      return { apyReward: 0, rewardTokens: [] };
    }

    let totalRewardAPY = 0;
    const rewardTokens = [];

    incentiveData.rewardsTokenInformation.forEach((reward) => {
      const {
        rewardTokenAddress,
        emissionPerSecond,
        rewardPriceFeed,
        rewardTokenDecimals,
        priceFeedDecimals,
        emissionEndTimestamp,
      } = reward;

      // Skip if emissions have ended
      const currentTimestamp = Math.floor(Date.now() / 1000);
      if (emissionEndTimestamp > 0 && currentTimestamp > emissionEndTimestamp) {
        return;
      }

      // Skip if no emissions
      if (!emissionPerSecond || emissionPerSecond === '0') {
        return;
      }

      // Calculate reward token price
      const rewardPrice =
        rewardPriceFeed > 0
          ? Number(rewardPriceFeed) / 10 ** Number(priceFeedDecimals)
          : 0;

      if (
        rewardPrice > 0 &&
        totalSupplyOrBorrow > 0 &&
        underlyingTokenPrice > 0
      ) {
        // Calculate annual reward emissions
        const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
        const annualRewardTokens =
          (Number(emissionPerSecond) / 10 ** Number(rewardTokenDecimals)) *
          SECONDS_PER_YEAR;
        const annualRewardUSD = annualRewardTokens * rewardPrice;

        // Calculate total pool value in USD
        const poolValueUSD = totalSupplyOrBorrow * underlyingTokenPrice;

        // Calculate reward APY as a percentage
        const rewardAPY = (annualRewardUSD / poolValueUSD) * 100;

        totalRewardAPY += rewardAPY;
        rewardTokens.push(rewardTokenAddress);
      }
    });

    return { apyReward: totalRewardAPY, rewardTokens };
  };

  const pools = reserves.map((reserve) => {
    const {
      underlyingAsset,
      name,
      symbol,
      decimals,
      liquidityRate,
      variableBorrowRate,
      availableLiquidity,
      totalScaledVariableDebt,
      baseLTVasCollateral,
      borrowingEnabled,
      isActive,
      isPaused,
      aTokenAddress,
    } = reserve;

    // Get price using chain:address format
    const priceKey = `${chain}:${underlyingAsset}`;
    const tokenPrice = prices[priceKey];

    // Calculate APYs (rates are in Ray format)
    const RAY = 10 ** 27;
    const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;

    const supplyAPY =
      liquidityRate > 0
        ? (Math.pow(
            1 + liquidityRate / RAY / SECONDS_PER_YEAR,
            SECONDS_PER_YEAR
          ) -
            1) *
          100
        : 0;

    const borrowAPY =
      variableBorrowRate > 0
        ? (Math.pow(
            1 + variableBorrowRate / RAY / SECONDS_PER_YEAR,
            SECONDS_PER_YEAR
          ) -
            1) *
          100
        : 0;

    // Calculate TVL and borrow amounts
    const liquidity = Number(availableLiquidity) / 10 ** Number(decimals);
    const borrowed = Number(totalScaledVariableDebt) / 10 ** Number(decimals);

    const liquidityUsd = tokenPrice?.price ? liquidity * tokenPrice.price : 0;
    const borrowedUsd = tokenPrice?.price ? borrowed * tokenPrice.price : 0;
    const totalSupplyUsd = liquidityUsd + borrowedUsd;
    const tvlUsd = liquidityUsd;

    // Find matching incentive data for this reserve
    const matchingIncentive = incentivesData.find(
      (inc) =>
        inc.underlyingAsset.toLowerCase() === underlyingAsset.toLowerCase()
    );

    // Calculate supply rewards (aToken incentives)
    const supplyRewards = matchingIncentive
      ? calculateRewardAPY(
          matchingIncentive.aIncentiveData,
          liquidity + borrowed, // total supply = available liquidity + borrowed
          tokenPrice?.price || 0,
          Number(decimals)
        )
      : { apyReward: 0, rewardTokens: [] };

    // Calculate borrow rewards (variable debt token incentives)
    const borrowRewards = matchingIncentive
      ? calculateRewardAPY(
          matchingIncentive.vIncentiveData,
          borrowed, // total borrowed
          tokenPrice?.price || 0,
          Number(decimals)
        )
      : { apyReward: 0, rewardTokens: [] };

    const url = `https://app.more.markets/reserve-overview/?underlyingAsset=${underlyingAsset.toLowerCase()}&marketName=proto_flow_v3`;

    return {
      pool: aTokenAddress.toLowerCase(),
      chain,
      project: 'more-lend',
      symbol,
      tvlUsd,
      apyBase: supplyAPY,
      apyReward: supplyRewards.apyReward,
      rewardTokens: supplyRewards.rewardTokens,
      underlyingTokens: [underlyingAsset],
      totalSupplyUsd,
      totalBorrowUsd: borrowedUsd,
      debtCeilingUsd: null,
      apyBaseBorrow: borrowAPY,
      apyRewardBorrow: borrowRewards.apyReward,
      ltv: Number(baseLTVasCollateral) / 10000,
      url,
      borrowable: borrowingEnabled && isActive && !isPaused,
      mintedCoin: null,
      poolMeta: `${name} on Flow EVM`,
    };
  });

  return pools;
};

module.exports = {
  apy,
};
