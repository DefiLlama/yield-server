const axios = require('axios');

const rFLR = '0x26d460c3Cf931Fb2014FA436a49e3Af08619810e'; // Reward FLR

const calculateApy = (_apr) => {
  // Handle extremely high APR values that could cause calculation issues
  if (_apr > 10000) { // If APR > 10000%, cap it to prevent extreme values
    return 10000;
  }
  
  const APR = _apr / 100;
  const n = 365;

  // APY calculation
  const APY = (1 + APR / n) ** n - 1;
  const APYPercentage = APY * 100;

  // Cap APY to reasonable maximum (10000%)
  return Math.min(APYPercentage, 10000);
};

const apy = async () => {
  const pools = (
    await axios.get(
      'https://api.sparkdex.ai/dex/v3/pairs?chainId=14&dex=SparkDEX&version=v3_1'
    )
  ).data[0].data;

  const chain = 'flare';

  const i = pools.map((lp) => {
    // Skip pools without APR data
    if (!lp.apr) return;
    
    // Skip pools with zero or negative TVL
    if (!lp.tvlUSD || lp.tvlUSD <= 0) return;

    const tvlUsd = lp.tvlUSD;
    const feeUsd = lp.feesUSDDay || 0;

    // Calculate base APY, handle division by zero
    const baseApy = tvlUsd > 0 && feeUsd > 0 ? (feeUsd / tvlUsd) * 365 * 100 : 0;

    let pool = {
      pool: `${lp.id}-${chain}`.toLowerCase(),
      symbol: `${lp.token0.symbol}-${lp.token1.symbol}`,
      project: 'sparkdex-v3.1',
      chain,
      tvlUsd,
      apyBase: baseApy,
      underlyingTokens: [lp.token0.address, lp.token1.address],
    };

    // Extract rFLR reward APRs
    const rFlrRewardAprs = lp.aprs.filter(
      (apr) => apr.provider === 'rFLR Rewards'
    );

    // Extract other reward APRs
    const rewardAprs = lp.aprs.filter(
      (apr) => !apr.isPoolApr && apr.provider !== 'rFLR Rewards'
    );

    // Calculate total reward APY from all sources
    const totalRewardApy = calculateApy(
      rewardAprs.reduce((sum, apr) => sum + apr.apr, 0)
    );
    const rFlrRewardApy = calculateApy(
      rFlrRewardAprs.reduce((sum, apr) => sum + apr.apr, 0)
    );

    // Add remaing rewards
    if (totalRewardApy > 0) {
      // Rewards can be swapped instantly to wFLR
      pool.apyReward = totalRewardApy;
      pool.rewardTokens = [rFLR]; // rFLR
    }

    // Add rFLR apr
    if (rFlrRewardApy > 0) {
      // rFLR can be swapped with 50% penalty instantly to wFLR or linear 12 months
      // so taking care to lower bund %50
      pool.apyReward = (pool.apyReward || 0) + rFlrRewardApy / 2;
      pool.rewardTokens = [rFLR]; // rFLR
    }

    return pool;
  });

  const result = i.filter(Boolean);

  console.log(result);

  return result;
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://sparkdex.ai/pool',
};
