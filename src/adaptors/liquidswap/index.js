const utils = require('../utils');
const { BigNumber } = require('bignumber.js');
const { FARMS, NODE_URL } = require('./constants');
const {
  getPoolTotalLPUrl,
  calcOutputBurnLiquidity,
  getFarmResourceUrl,
  decimalsMultiplier,
} = require('./utils');
const { fetchPoolTotalMintedLP, fetchFarmPoolData } = require('./api');

async function fecthFarmPoolData() {}

function calculateRewardPerWeek() {}

async function main() {
  // const decimalsReward = decimalsMultiplier(
  //   farmPool.rewardCoin.decimals,
  // ).toNumber();

  // const decimalsLP = decimalsMultiplier(LP_DECIMALS).toNumber();
  // const numerator = farmPool.rewardPerSecond * WEEK_SEC;
  // const denominator =
  //   farmPool.stakeCoins + farmPool.totalBoosted + decimalsLP;
  // const estimation = numerator / denominator;
  // const normalizer = decimalsLP / decimalsReward;
  // farmPool.rewardPerWeekOnLp = estimation * normalizer * decimalsReward;

  const testDec = decimalsMultiplier(6).toNumber();

  const testBurnLiq = calcOutputBurnLiquidity({
    xReserve: 100000,
    yReserve: 100000,
    lpSupply: 10000000,
    toBurn: 10000,
  });

  const testPriceReq = await utils.getPrices([`coingecko:aptos`]);

  console.log('testDec', testDec);
  console.log('testBurnLiq', testBurnLiq);
  console.log('testPriceReq', testPriceReq);

  console.log('farmPool url', farmPoolUrl);
  const apyData = await fetchFarmPoolData(
    APT_AMNIS_STAPT_FARM.deployedAddress,
    APT_AMNIS_STAPT_FARM.coinX,
    APT_AMNIS_STAPT_FARM.coinY,
    APT_AMNIS_STAPT_FARM.curve,
    APT_AMNIS_STAPT_FARM.reward,
    APT_AMNIS_STAPT_FARM.resourceAccount
  );

  const apyData1 = await fetchPoolTotalMintedLP(
    APT_AMNIS_STAPT_FARM.deployedAddress,
    APT_AMNIS_STAPT_FARM.coinX,
    APT_AMNIS_STAPT_FARM.coinY,
    APT_AMNIS_STAPT_FARM.curve,
    APT_AMNIS_STAPT_FARM.resourceAccount
  );

  console.log('apyData', apyData);
  console.log('apyData1', apyData1);
}

main();

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.thala.fi/pools',
};
