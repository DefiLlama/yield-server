const sdk = require('@defillama/sdk');

const abiGMIncentives = require('./abi/abiGMIncentives.json');
const {ADDRESSES, CHAIN, SECONDS_PER_YEAR} = require('./Constants');

/**
 * Calculates the reward APY from GLOOP emissions
 */
const getRewardAPY = async (gloopPrice, totalLendingPoolUSDCValue) => {
  try {
    if (!gloopPrice || gloopPrice <= 0) {
      return 0;
    }

    if (!totalLendingPoolUSDCValue || totalLendingPoolUSDCValue <= 0) {
      return 0;
    }

    // Get GLOOP rewards data
    const rewardsDataResult = await sdk.api.abi.call({
      target: ADDRESSES.GM_INCENTIVES,
      abi: abiGMIncentives.find((m) => m.name === 'getRewardsData'),
      params: [ADDRESSES.GLOOP],
      chain: CHAIN,
    });

    const rewardsData = rewardsDataResult.output;

    if (!rewardsData || !Array.isArray(rewardsData) || rewardsData.length < 3) {
      return 0;
    }

    // Check if reward distribution has ended
    // rewardsData[2] is distributionEnd timestamp
    const distributionEnd = BigInt(rewardsData[2]);
    const currentTimestamp = BigInt(Math.floor(Date.now() / 1000));

    if (currentTimestamp > distributionEnd) {
      // Reward distribution has ended
      return 0;
    }

    // Get emissions per second (rewardsData[1])
    const emissionsPerSecond = BigInt(rewardsData[1]);

    if (emissionsPerSecond === 0n) {
      return 0;
    }

    // Convert emissions from 18 decimals to decimal
    const emissionsPerSecondDecimal = Number(emissionsPerSecond) / 1e18;

    // Formula: Reward APY = ((GLOOP Emissions Rate * Seconds per year * GLOOP Token Price) / total USDC lent) * 100%
    const annualRewardValue =
      emissionsPerSecondDecimal * SECONDS_PER_YEAR * gloopPrice;
    const aprDecimal = annualRewardValue / totalLendingPoolUSDCValue;
    const aprPercentage = aprDecimal * 100;

    return aprPercentage;
  } catch (error) {
    console.error('Error calculating reward APY:', error);
    return 0;
  }
};

module.exports = {
  getRewardAPY,
};
