const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');
const { aTokenAbi } = require('../aave-v3/abi');
const poolAbi = require('../aave-v3/poolAbi');
const ISubscriptionDataIncentiveProvider = require('./abis/ISubscriptionDataIncentiveProvider.json');
const chain = 'core';

// List of PoolDataProviders where you can add additional 0x addresses as needed.
const poolDataProviders = [
  '0x567AF83d912C85c7a66d093e41D92676fA9076E3', // Main market
  '0x8E43DF2503c69b090D385E36032814c73b746e3d', // LSTBTC market
  // Add more PoolDataProvider addresses here as needed
];

const subscriptionDataIncentiveProvider = '0xa839c32CF4bA69f8c0eb06fA6BFc57C40B3f3f83';
const subscriptionPool = '0x971A4AD43a98a0d17833aB8c9FeC25b93a38B9A3';
const marketNameByDataProvider = {
  '0x567af83d912c85c7a66d093e41d92676fa9076e3': 'proto_core_mainnet',
  '0x8e43df2503c69b090d385e36032814c73b746e3d': 'proto_lstbtc_mainnet',
};
const fetchMarketData = async (target) => {
  const [reserveTokens, aTokens] = await Promise.all([
    sdk.api.abi.call({
      target,
      abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
      chain,
    }),
    sdk.api.abi.call({
      target,
      abi: poolAbi.find((m) => m.name === 'getAllATokens'),
      chain,
    }),
  ]).then(([reserves, atokens]) => [reserves.output, atokens.output]);

   // Helper function to calculate reward APY
   const calculateRewardAPY = async (
    incentiveData,
    tokenDecimals,
    tokenPrice
  ) => {
    if (
      !incentiveData ||
      !incentiveData.trackingIncentiveData ||
      incentiveData.trackingIncentiveData.rewardsTokenInformation.length === 0
    ) {
      return { apyReward: 0, rewardTokens: [] };
    }
    
    let trackingTokenTotalSupply = await sdk.api.abi.call({
      target: incentiveData.trackingIncentiveData.tokenAddress,
      abi: aTokenAbi.find(({ name }) => name === 'totalSupply'),
      chain,
    });
    let totalSupplyInUsd = (trackingTokenTotalSupply.output / 10 ** tokenDecimals) * tokenPrice;
    let totalRewardAPY = 0;
    const rewardTokens = [];
    incentiveData.trackingIncentiveData.rewardsTokenInformation.forEach((reward) => {
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
        totalSupplyInUsd > 0
      ) {
        // Calculate annual reward emissions
        const SECONDS_PER_YEAR = 365 * 24 * 60 * 60;
        const annualRewardTokens =
          (Number(emissionPerSecond) / 10 ** Number(rewardTokenDecimals)) *
          SECONDS_PER_YEAR;
        const annualRewardUSD = annualRewardTokens * rewardPrice;
        // Calculate reward APY as a percentage
        const rewardAPY = (annualRewardUSD / totalSupplyInUsd) * 100;
        totalRewardAPY += rewardAPY;
        rewardTokens.push(rewardTokenAddress);
      }
    });
    return { apyReward: totalRewardAPY, rewardTokens };
  };

  const [poolsReserveData, poolsReservesConfigurationData, poolsReserveCaps, balanceData, decimalsData] = await Promise.all([
    sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({ target, params: p.tokenAddress })),
      abi: poolAbi.find((m) => m.name === 'getReserveData'),
      chain,
    }),
    sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({ target, params: p.tokenAddress })),
      abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
      chain,
    }),
    sdk.api.abi.multiCall({
      calls: reserveTokens.map((p) => ({ target, params: p.tokenAddress })),
      abi: poolAbi.find((m) => m.name === 'getReserveCaps'),
      chain,
    }),
    sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'balanceOf'),
      calls: aTokens.map((t, i) => ({ target: reserveTokens[i].tokenAddress, params: [t.tokenAddress] })),
    }),
    sdk.api.abi.multiCall({
      chain,
      abi: aTokenAbi.find(({ name }) => name === 'decimals'),
      calls: aTokens.map((t) => ({ target: t.tokenAddress })),
    }),
  ]);

  let aggregatedReserveIncentiveData = [];
  try {
    const incentivesResult = await sdk.api.abi.call({
      target: subscriptionDataIncentiveProvider,
      abi: ISubscriptionDataIncentiveProvider.abi.find(({ name }) => name === 'getReservesIncentivesData'),
      params: [subscriptionPool],
      chain,
    });
    aggregatedReserveIncentiveData = incentivesResult.output || [];
  } catch (error) {
    // Continue without incentive data if unavailable
  }

  const priceKeys = reserveTokens.map((t) => `${chain}:${t.tokenAddress}`).join(',');
  const pricesEthereum = (await utils.getPriceApiData(`/prices/current/${priceKeys}`)).coins;

  return Promise.all(reserveTokens.map(async (pool, i) => {
    const frozen = poolsReservesConfigurationData.output[i].output.isFrozen;
    if (frozen) return null;

    const p = poolsReserveData.output[i].output;
    const price = pricesEthereum[`${chain}:${pool.tokenAddress}`]?.price;
    const decimals = Number(decimalsData.output[i].output);
    const toTokenAmount = (amount) => Number(amount) / 10 ** decimals;

    const currentSupply = balanceData.output[i].output;
    const tvlUsd = toTokenAmount(currentSupply) * price;

    const totalBorrow =
      BigInt(p.totalStableDebt) + BigInt(p.totalVariableDebt);
    const totalBorrowUsd = toTokenAmount(totalBorrow) * price;
    const totalSupplyUsd = tvlUsd + totalBorrowUsd;
    const borrowCapUsd = Number(poolsReserveCaps.output[i].output.borrowCap) * price;
    const availableBorrowUsd = Number(poolsReserveCaps.output[i].output.borrowCap)
      ? Math.max(Math.min(tvlUsd, borrowCapUsd - totalBorrowUsd), 0)
      : tvlUsd;
    const marketName = marketNameByDataProvider[target.toLowerCase()];
    const url = `https://app.colend.xyz/reserve-overview/?underlyingAsset=${pool.tokenAddress.toLowerCase()}&marketName=${marketName}`;

    // Find matching incentive data for this reserve
    const matchingIncentive = aggregatedReserveIncentiveData.find(
      (inc) =>
        inc.underlyingAsset.toLowerCase() === pool.tokenAddress.toLowerCase()
    );
    
    // Calculate supply rewards (aToken incentives)
    const supplyRewards = matchingIncentive
      ? await calculateRewardAPY(
        matchingIncentive,
        decimals,
        price
      )
      : { apyReward: 0, rewardTokens: [] };
      
    return {
      pool: `${aTokens[i].tokenAddress}-${chain}`.toLowerCase(),
      chain,
      project: 'colend-protocol',
      symbol: pool.symbol,
      tvlUsd,
      apyBase: (p.liquidityRate / 10 ** 27) * 100,
      apyReward: supplyRewards.apyReward,
      rewardTokens: supplyRewards.rewardTokens,
      underlyingTokens: [pool.tokenAddress],
      totalSupplyUsd,
      totalBorrowUsd,
      availableBorrowUsd,
      apyBaseBorrow: Number(p.variableBorrowRate) / 1e25,
      borrowToken: pool.tokenAddress,
      ltv: poolsReservesConfigurationData.output[i].output.ltv / 10000,
      url,
      borrowable: poolsReservesConfigurationData.output[i].output.borrowingEnabled,
    };
  })).then((pools) => pools.filter(Boolean));
};

const apy = async () => {
  // Fetch data for all PoolDataProviders in a flexible way
  const allMarketData = await Promise.all(
    poolDataProviders.map(fetchMarketData)
  );

  // Combine results from all markets
  const combinedMarketData = allMarketData.flat();

  return combinedMarketData.filter((p) => utils.keepFinite(p));
};

module.exports = {
  protocolId: '4518',
  timetravel: false,
  apy,
  url: 'https://app.colend.xyz/markets/',
};
