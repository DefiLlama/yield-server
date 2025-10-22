const sdk = require('@defillama/sdk');

const {
  getPrices,
  calculateInterestYieldPercentage,
  toUsdValue,
  overallBorrowInterestRate,
  calculateRewardAprPercentage,
} = require('./utils');
const {
  PROJECT_SLUG,
  HubPools,
  ONE_18_DP,
  EVERY_HOUR,
  EVERY_SECOND,
  GENERAL_LOAN_TYPE,
  loanManagerAddress,
  rewardsV2Address,
  RewardsTokenV2,
} = require('./constants');
const { LoanManagerAbi, HubPoolAbi, RewardsV2Abi } = require('./abis');

async function initPools() {
  // Get TVL for each spoke token in each chain
  const chainsPoolsTvl = await Promise.all(
    Object.keys(HubPools).map(async (chain) => {
      const chainApi = new sdk.ChainApi({
        chain: chain,
        timestamp: Math.floor(Date.now() / 1000),
      });
      const tokensAndOwners = HubPools[chain].pools.map((pool) => [
        pool.tokenAddress,
        pool.spokeAddress ?? pool.poolAddress,
      ]);
      return await chainApi.sumTokens({ tokensAndOwners });
    })
  );

  // Get prices for each pool token
  const tokenPrices = await getPrices(chainsPoolsTvl.map(Object.keys).flat());

  // Init Pool Info for each pool for each chain
  return chainsPoolsTvl.flatMap((chainPoolsTvl) => {
    return Object.entries(chainPoolsTvl)
      .map(([token, poolTvl]) => {
        const priceInfo = tokenPrices[token];
        if (!priceInfo || priceInfo.price === undefined) return null;

        const [chain, tvlTokenAddress] = token.split(':');
        const { price, decimals } = priceInfo;
      const { pools, name } = HubPools[chain];
      const pool = pools.find(
        ({ tokenAddress }) => tokenAddress.toLowerCase() === tvlTokenAddress
      );

      return {
        pool: `${pool.poolAddress}-${chain}`.toLowerCase(),
        chain: name,
        project: PROJECT_SLUG,
        symbol: pool.underlyingSymbol,
        tvlUsd: toUsdValue(poolTvl, price, decimals),
        underlyingTokens: [pool.tokenAddress],
        rewardTokens: [],
        apyReward: 0,
        meta: {
          poolId: pool.id,
          pool: pool.poolAddress.toLowerCase(),
          chain,
          price,
          decimals,
        },
      };
      })
      .filter(Boolean);
  });
}

const updateWithLendingData = async (poolsInfo) => {
  const chainApi = new sdk.ChainApi({
    chain: 'avax',
    timestamp: Math.floor(Date.now() / 1000),
  });

  // Fetch lending data for each pool
  const [targets, poolIds] = [
    poolsInfo.map((item) => item.meta.pool),
    poolsInfo.map((item) => item.meta.poolId),
  ];
  const [depositData, variableBorrowData, stableBorrowData, loanPools] =
    await Promise.all([
      await chainApi.multiCall({
        calls: targets,
        abi: HubPoolAbi.getDepositData,
      }),
      await chainApi.multiCall({
        calls: targets,
        abi: HubPoolAbi.getVariableBorrowData,
      }),
      await chainApi.multiCall({
        calls: targets,
        abi: HubPoolAbi.getStableBorrowData,
      }),
      await chainApi.multiCall({
        calls: poolIds.map((poolId) => ({
          target: loanManagerAddress,
          params: [GENERAL_LOAN_TYPE, poolId],
        })),
        abi: LoanManagerAbi.getLoanPool,
      }),
    ]);

  // Convert data to BigInt
  const [depositTotalAmount, depositInterestRate] = [
    depositData.map((item) => BigInt(item.totalAmount)),
    depositData.map((item) => BigInt(item.interestRate)),
  ];
  const [varBorrTotalAmount, varBorrInterestRate] = [
    variableBorrowData.map((item) => BigInt(item.totalAmount)),
    variableBorrowData.map((item) => BigInt(item.interestRate)),
  ];
  const [stblBorrTotalAmount, stblBorrInterestRate] = [
    stableBorrowData.map((item) => BigInt(item.totalAmount)),
    stableBorrowData.map((item) => BigInt(item.interestRate)),
  ];
  const ltvs = loanPools.map(
    (item) => (Number(item.collateralFactor) * Number(item.borrowFactor)) / 1e8
  );

  poolsInfo.forEach((poolInfo, i) => {
    const { price, decimals } = poolInfo.meta;
    const totalDebt = varBorrTotalAmount[i] + stblBorrTotalAmount[i];

    // Calculate overall borrow rate
    const borrowRate = overallBorrowInterestRate(
      varBorrInterestRate[i],
      varBorrTotalAmount[i],
      stblBorrInterestRate[i],
      stblBorrTotalAmount[i]
    );

    // Update pool info
    poolInfo.apyBase = calculateInterestYieldPercentage(
      depositInterestRate[i],
      EVERY_HOUR,
      ONE_18_DP
    );
    poolInfo.apyBaseBorrow = calculateInterestYieldPercentage(
      borrowRate,
      EVERY_SECOND,
      ONE_18_DP
    );
    poolInfo.totalSupplyUsd = toUsdValue(
      depositTotalAmount[i],
      price,
      decimals
    );
    poolInfo.totalBorrowUsd = toUsdValue(totalDebt, price, decimals);
    poolInfo.ltv = ltvs[i];
  });
  return poolsInfo;
};

const updateWithRewardsV2Data = async (poolsInfo) => {
  const now = Math.floor(Date.now() / 1000);
  const chainApi = new sdk.ChainApi({
    chain: 'avax',
    timestamp: now,
  });

  // Fetch active epoch data for each pool
  const poolIds = poolsInfo.map((pool) => pool.meta.poolId);
  const activeEpochs = await chainApi.multiCall({
    calls: poolIds.map((poolId) => ({
      target: rewardsV2Address,
      params: [poolId],
    })),
    abi: RewardsV2Abi.getActivePoolEpoch,
    permitFailure: true,
  });

  // Extract rewards info for each reward token for each pool epoch

  const poolRewardsInfo = activeEpochs.map((activeEpoch) => {
    if (activeEpoch === null) return null;
    const [start, end, rewards] = [
      BigInt(activeEpoch.epoch.start),
      BigInt(activeEpoch.epoch.end),
      activeEpoch.epoch.rewards,
    ];

    const remainingTime = end - BigInt(now);
    const fullEpochTime = end - start;
    return {
      remainingTime,
      fullEpochTime,
      remainingRewards: rewards.map((reward) => [
        reward.rewardTokenId,
        (remainingTime * BigInt(reward.totalRewards)) / fullEpochTime,
      ]),
    };
  });
  const rewardsTokenPriceIds = poolRewardsInfo
    .filter(Boolean)
    .map((poolRewardInfo) =>
      poolRewardInfo.remainingRewards.map(
        ([rewardTokenId]) =>
          `${RewardsTokenV2[rewardTokenId].chain}:${RewardsTokenV2[rewardTokenId].tokenAddress}`
      )
    )
    .flat();

  const tokenPrices = await getPrices(rewardsTokenPriceIds);

  poolsInfo.forEach((poolInfo, i) => {
    if (poolRewardsInfo[i] === null) return;
    const { remainingRewards, remainingTime } = poolRewardsInfo[i];
    remainingRewards.forEach(([rewardTokenId, remainingRewardsAmount]) => {
      const rewardTokenInfo = RewardsTokenV2[rewardTokenId];
      const rewardTokenPrice =
        tokenPrices[
          `${
            rewardTokenInfo.chain
          }:${rewardTokenInfo.tokenAddress.toLowerCase()}`
        ];

      poolInfo.rewardTokens.push(rewardTokenInfo.tokenAddress);
      poolInfo.apyReward += calculateRewardAprPercentage(
        remainingRewardsAmount,
        rewardTokenPrice?.price,
        rewardTokenPrice?.decimals,
        poolInfo.totalSupplyUsd,
        remainingTime
      );
    });
  });

  return poolsInfo;
};

const deletePoolsInfoMeta = async (poolsInfo) => {
  return poolsInfo.map((pool) => {
    delete pool.meta;
    return pool;
  });
};

const calcYields = async () => {
  return await initPools()
    .then(updateWithLendingData)
    .then(updateWithRewardsV2Data)
    .then(deletePoolsInfoMeta);
};

module.exports = {
  timetravel: true,
  apy: calcYields,
  url: 'https://xapp.folks.finance/',
};
