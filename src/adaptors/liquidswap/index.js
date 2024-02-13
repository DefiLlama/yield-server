const utils = require('../utils');
const { BigNumber } = require('bignumber.js');
const {
  FARMS,
  NODE_URL,
  APT_AMNIS_STAPT_FARM,
  LP_DECIMALS,
  WEEK_SEC,
} = require('./constants');
const {
  getPoolTotalLPUrl,
  getFarmResourceUrl,
  decimalsMultiplier,
  calcOutputBurnLiquidity,
  calcRewardPerWeekPerOneLp,
} = require('./utils');
const { fetchPoolTotalMintedLP, fetchFarmPoolData } = require('./api');

async function fecthFarmPoolData() {}

function calculateRewardPerWeek() {}

async function main() {
  const decimalsReward = decimalsMultiplier(
    APT_AMNIS_STAPT_FARM.rewardTokenInfo.decimals
  ).toNumber();

  const farmData = await fetchFarmPoolData(
    APT_AMNIS_STAPT_FARM.deployedAddress,
    APT_AMNIS_STAPT_FARM.coinX,
    APT_AMNIS_STAPT_FARM.coinY,
    APT_AMNIS_STAPT_FARM.curve,
    APT_AMNIS_STAPT_FARM.rewardTokenInfo.type,
    APT_AMNIS_STAPT_FARM.resourceAccount
  );

  const rewardPerWeekPerOneLP = calcRewardPerWeekPerOneLp(
    farmData,
    APT_AMNIS_STAPT_FARM.rewardTokenInfo
  );

  // ----

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

  const apyData = await fetchFarmPoolData(
    APT_AMNIS_STAPT_FARM.deployedAddress,
    APT_AMNIS_STAPT_FARM.coinX,
    APT_AMNIS_STAPT_FARM.coinY,
    APT_AMNIS_STAPT_FARM.curve,
    APT_AMNIS_STAPT_FARM.rewardTokenInfo.type,
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
