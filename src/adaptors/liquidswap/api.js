const utils = require('../utils');
const { getPoolTotalLPUrl, getFarmResourceUrl } = require('./utils');

async function fetchPoolTotalMintedLP(
  deployedAddress,
  coinX,
  coinY,
  curve,
  resourceAccount
) {
  const response = await utils.getData(
    getPoolTotalLPUrl(deployedAddress, coinX, coinY, curve, resourceAccount)
  );

  return response;
}

async function fetchFarmPoolData(
  deployedAddress,
  coinX,
  coinY,
  curve,
  reward,
  resourceAccount
) {
  const response = await utils.getData(
    getFarmResourceUrl(
      deployedAddress,
      coinX,
      coinY,
      curve,
      reward,
      resourceAccount
    )
  );

  return {
    rewardPerSecond: BigInt(response.data.reward_per_sec),
    stakeCoins: BigInt(response.data.stake_coins.value),
    totalBoosted: BigInt(response.data.total_boosted),
  };
}

module.exports = { fetchPoolTotalMintedLP, fetchFarmPoolData };
