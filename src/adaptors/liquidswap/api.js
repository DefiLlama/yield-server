const utils = require('../utils');
const {
  getPoolTotalLPUrl,
  getFarmResourceUrl,
  getPoolResourceUrl,
} = require('./utils');

async function fetchPoolTotalMintedLP(coinX, coinY, curve, resourceAccount) {
  const response = await utils.getData(
    getPoolTotalLPUrl(coinX, coinY, curve, resourceAccount)
  );

  return BigInt(response.data.supply.vec[0].integer.vec[0].value);
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

async function fetchLiquidityPoolData(
  coinX,
  coinY,
  curve,
  resourceAccount,
  moduleAccount
) {
  const response = await utils.getData(
    getPoolResourceUrl(coinX, coinY, curve, resourceAccount, moduleAccount)
  );

  return {
    coinXReserves: BigInt(response.data.coin_x_reserve.value),
    coinYReserves: BigInt(response.data.coin_y_reserve.value),
  };
}

async function getAPRsFromSentio() {
  return await utils.getData('https://api.liquidswap.com/sentio/apr')
}

module.exports = {
  fetchFarmPoolData,
  fetchLiquidityPoolData,
  fetchPoolTotalMintedLP,
  getAPRsFromSentio,
};
