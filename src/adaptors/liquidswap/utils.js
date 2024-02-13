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

// https://aptos-mainnet.pontem.network/v1/accounts/0x61d2c22a6cb7831bee0f48363b0eec92369357aece0d1142062f7d5d85c7bef8/resource/0x163df34fccbf003ce219d3f1d9e70d140b60622cb9dd47599c25fb2f797ba6e::liquidity_pool::LiquidityPool<0x7fd500c11216f0fe3095d0c4b8aa4d64a4e2e04f83758462f2b127255643615::thl_coin::THL,0x1::aptos_coin::AptosCoin,0x163df34fccbf003ce219d3f1d9e70d140b60622cb9dd47599c25fb2f797ba6e::curves::Stable>

function getPoolResourceUrl(
  deploymentAddress,
  coinXType,
  coinYType,
  curveType,
  rewardType,
  resourceAccount
) {
  return `${NODE_URL}/accounts/${deploymentAddress}/resource/${LP_STAKING_ACCOUNT}::stake::StakePool<${resourceAccount}::lp_coin::LP<${coinXType},${coinYType},${curveType}>,${rewardType}>`;
}

//https://aptos-mainnet.pontem.network/v1/accounts/0x61d2c22a6cb7831bee0f48363b0eec92369357aece0d1142062f7d5d85c7bef8/resource/0x1::coin::CoinInfo<0x61d2c22a6cb7831bee0f48363b0eec92369357aece0d1142062f7d5d85c7bef8::lp_coin::LP<0x1::aptos_coin::AptosCoin,0x111ae3e5bc816a5e63c2da97d0aa3886519e0cd5e4b046659fa35796bd11542a::stapt_token::StakedApt,0x163df34fccbf003ce219d3f1d9e70d140b60622cb9dd47599c25fb2f797ba6e::curves::Uncorrelated>>
function getPoolTotalLPUrl(
  deploymentAddress,
  coinXType,
  coinYType,
  curveType,
  resourceAccount
) {
  return `${NODE_URL}/accounts/${resourceAccount}/resource/0x1::coin::CoinInfo<${resourceAccount}::lp_coin::LP<${coinXType},${coinYType},${curveType}>>`;
}

/**
 * Calculate output amount after burned
 */
function calcOutputBurnLiquidity({ xReserve, yReserve, lpSupply, toBurn }) {
  const xReturn = BigNumber(toBurn).multipliedBy(xReserve).dividedBy(lpSupply);
  const yReturn = BigNumber(toBurn).multipliedBy(yReserve).dividedBy(lpSupply);

  if (xReturn.isEqualTo(0) || yReturn.isEqualTo(0)) {
    return undefined;
  }

  return {
    x: xReturn.toNumber(),
    y: yReturn.toNumber(),
  };
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

module.exports = {
  getPoolTotalLPUrl,
  getFarmResourceUrl,
  decimalsMultiplier,
  calcOutputBurnLiquidity,
  calcRewardPerWeekPerOneLp,
};
