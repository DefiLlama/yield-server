const {
  FARMS,
  NODE_URL,
  LP_STAKING_ACCOUNT,
  LP_DECIMALS,
  WEEK_SEC,
} = require('./constants');
const { BigNumber } = require('bignumber.js');

function getFarmResourceUrl(
  deploymentAddress,
  coinXType,
  coinYType,
  curveType,
  rewardType,
  resourceAccount
) {
  return `${NODE_URL}/accounts/${deploymentAddress}/resource/${LP_STAKING_ACCOUNT}::stake::StakePool<${resourceAccount}::lp_coin::LP<${coinXType},${coinYType},${curveType}>,${rewardType}>`;
}

function getPoolResourceUrl(
  coinXType,
  coinYType,
  curveType,
  resourceAccount,
  moduleAccount
) {
  return `${NODE_URL}/accounts/${resourceAccount}/resource/${moduleAccount}::liquidity_pool::LiquidityPool<${coinXType},${coinYType},${curveType}>`;
}

function getPoolTotalLPUrl(coinXType, coinYType, curveType, resourceAccount) {
  return `${NODE_URL}/accounts/${resourceAccount}/resource/0x1::coin::CoinInfo<${resourceAccount}::lp_coin::LP<${coinXType},${coinYType},${curveType}>>`;
}

function calcOutputBurnLiquidity({ xReserve, yReserve, lpSupply, toBurn }) {
  const xReturn = BigNumber(toBurn).multipliedBy(xReserve).dividedBy(lpSupply);
  const yReturn = BigNumber(toBurn).multipliedBy(yReserve).dividedBy(lpSupply);

  if (xReturn.isEqualTo(0) || yReturn.isEqualTo(0)) {
    return undefined;
  }

  return {
    x: Math.trunc(xReturn.toNumber()),
    y: Math.trunc(yReturn.toNumber()),
  };
}

function getAmountWithDecimal(amount, decimal) {
  if (amount === undefined) return;

  return +BigNumber(amount)
    .dividedBy(decimalsMultiplier(decimal))
    .toFixed(decimal);
}

function decimalsMultiplier(decimals) {
  return BigNumber(10).exponentiatedBy(BigNumber(decimals).absoluteValue());
}

function calcRewardPerWeekPerOneLp(farmData, rewardToken) {
  const decimalsReward = decimalsMultiplier(rewardToken.decimals).toNumber();

  const decimalsLP = decimalsMultiplier(LP_DECIMALS).toNumber();
  const numerator = BigNumber(farmData.rewardPerSecond).multipliedBy(WEEK_SEC);
  const denominator = BigNumber(farmData.stakeCoins)
    .plus(farmData.totalBoosted)
    .plus(decimalsLP);

  const estimation = BigNumber(numerator).dividedBy(denominator);
  const normalizer = BigNumber(decimalsLP).dividedBy(decimalsReward);
  const rewardPerWeekOnLp = estimation
    .multipliedBy(normalizer)
    .multipliedBy(decimalsReward);

  return rewardPerWeekOnLp.toNumber();
}

function getUSDEquivalent(coinAmount, usdRate) {
  if (!coinAmount || !usdRate) return 0;
  return BigNumber(coinAmount).multipliedBy(BigNumber(usdRate)).toNumber();
}

module.exports = {
  getUSDEquivalent,
  getPoolTotalLPUrl,
  decimalsMultiplier,
  getFarmResourceUrl,
  getPoolResourceUrl,
  getAmountWithDecimal,
  calcOutputBurnLiquidity,
  calcRewardPerWeekPerOneLp,
};
