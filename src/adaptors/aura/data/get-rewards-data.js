const { getAuraPoolRewards } = require('./subgraph/rewards');
const { calculateRewardApr } = require('../utils/calculate-reward-apr');
const { calculateAuraMintAmount } = require('../utils/calculate-aura-mint');
const { isRewardActive } = require('../utils/is-reward-active');
const { fetchTokenPrices } = require('../utils/token-prices');
const { getMintRate } = require('./rpc/l2coordinator');
const { COMMON_CONFIG } = require('../constants');

/**
 * Get rewards data for all pools
 */
async function getRewardsData(
  activePools,
  chainName,
  chainConfig,
  tvlsData,
  auraGlobals,
  sdkChainName
) {
  const subgraphData = await getAuraPoolRewards(chainName);
  if (!subgraphData?.pools) return {};

  // Collect all reward tokens for pricing
  const rewardTokens = new Set();
  rewardTokens.add(chainConfig.tokens.AURA);
  rewardTokens.add(chainConfig.tokens.BAL);

  subgraphData.pools.forEach((pool) => {
    pool.rewardData?.forEach((r) => {
      if (r.token?.id) rewardTokens.add(r.token.id);
    });
  });

  const [tokenPrices, mintRate] = await Promise.all([
    fetchTokenPrices(rewardTokens, sdkChainName),
    getMintRate(chainConfig.l2Coordinator, sdkChainName),
  ]);

  const auraTokenAddress = chainConfig.tokens.AURA.toLowerCase();
  const balTokenAddress = chainConfig.tokens.BAL.toLowerCase();

  return subgraphData.pools.reduce((acc, subgraphPool) => {
    const poolIndex = parseInt(subgraphPool.id);
    const tvl = tvlsData[poolIndex];

    if (isNaN(poolIndex) || !subgraphPool.rewardData?.length || !tvl) {
      return acc;
    }

    acc[poolIndex] = subgraphPool.rewardData.reduce((rewards, r) => {
      const rewardToken = r.token?.id?.toLowerCase();

      const tokenPrice = tokenPrices[rewardToken];
      const isActive = isRewardActive(r.periodFinish, r.queuedRewards);

      // Skip inactive rewards
      if (!isActive) return rewards;
      if (!tokenPrice) return rewards;

      const apr = calculateRewardApr(
        r.rewardRate || '0',
        tokenPrice,
        tvl,
        r.token?.decimals
      );

      if (apr > 0) {
        rewards.push({ rewardToken, apr });
      }

      // Calculate minted AURA for BAL rewards
      if (rewardToken === balTokenAddress) {
        const balPerYear =
          BigInt(r.rewardRate || '0') * BigInt(COMMON_CONFIG.SECONDS_PER_YEAR);
        const mintedAuraPerYear = calculateAuraMintAmount(
          balPerYear.toString(),
          auraGlobals
        );
        const auraPrice = tokenPrices[auraTokenAddress];

        if (auraPrice && BigInt(mintedAuraPerYear) > 0n) {
          // Apply mintRate multiplier for L2 chains
          const adjustedMintedAura =
            (BigInt(mintedAuraPerYear) * mintRate) / 1000000000000000000n;
          const auraApr =
            (((Number(adjustedMintedAura) / 1e18) * auraPrice) / tvl) * 100;

          if (auraApr > 0) {
            // Find existing AURA reward and add to it, or create new entry
            const existingAuraReward = rewards.find(
              (reward) => reward.rewardToken === auraTokenAddress
            );
            if (existingAuraReward) {
              existingAuraReward.apr += auraApr;
            } else {
              rewards.push({ rewardToken: auraTokenAddress, apr: auraApr });
            }
          }
        }
      }

      return rewards;
    }, []);

    return acc;
  }, {});
}

module.exports = {
  getRewardsData,
};
