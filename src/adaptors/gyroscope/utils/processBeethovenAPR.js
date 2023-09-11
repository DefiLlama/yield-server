function processBeethovenAPR(apr) {
  if (!apr) return apr;

  const swapFees =
    Number(apr.items.find(({ title }) => title === 'Swap fees APR').apr.total) *
    10000;
  const nativeRewardApr = Number(apr.nativeRewardApr.min) * 10000;
  const thirdPartyApr = Number(apr.thirdPartyApr.min) * 10000;

  const min = swapFees + nativeRewardApr + thirdPartyApr;

  const stETHApr = apr.items.find(({ title }) => title === 'stETH APR')?.apr
    ?.total;

  return {
    min,
    swapFees,
    stakingApr: {
      min: nativeRewardApr,
      max: Number(apr.nativeRewardApr.max) * 10000,
    },
    rewardAprs: { total: thirdPartyApr },
    stETHApr: stETHApr && stETHApr * 100,
  };
}

module.exports = processBeethovenAPR;
