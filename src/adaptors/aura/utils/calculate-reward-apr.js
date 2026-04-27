const { COMMON_CONFIG } = require('../constants');

/**
 * Calculate APR from reward rate
 */
function calculateRewardApr(rewardRate, tokenPrice, tvl, decimals = 18) {
  if (!rewardRate || !tokenPrice || !tvl) return 0;

  const rewardPerYear = Number(rewardRate) * COMMON_CONFIG.SECONDS_PER_YEAR;
  const rewardPerYearScaled = rewardPerYear / Math.pow(10, decimals);

  return ((rewardPerYearScaled * tokenPrice) / tvl) * 100;
}

module.exports = {
  calculateRewardApr,
};
