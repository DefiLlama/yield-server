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
  getUSDEquivalent,
  getPoolTotalLPUrl,
  decimalsMultiplier,
  getFarmResourceUrl,
  getAmountWithDecimal,
  calcOutputBurnLiquidity,
  calcRewardPerWeekPerOneLp,
} = require('./utils');
const {
  fetchPoolTotalMintedLP,
  fetchFarmPoolData,
  fetchLiquidityPoolData,
} = require('./api');

async function fecthFarmPoolData() {}

function calculateRewardPerWeek() {}

async function main() {
  const decimalsReward = decimalsMultiplier(
    APT_AMNIS_STAPT_FARM.rewardTokenInfo.decimals
  ).toNumber();

  const farmData = await fetchFarmPoolData(
    APT_AMNIS_STAPT_FARM.deployedAddress,
    APT_AMNIS_STAPT_FARM.coinX.type,
    APT_AMNIS_STAPT_FARM.coinY.type,
    APT_AMNIS_STAPT_FARM.curve,
    APT_AMNIS_STAPT_FARM.rewardTokenInfo.type,
    APT_AMNIS_STAPT_FARM.resourceAccount
  );

  const rewardPerWeekPerOneLP = calcRewardPerWeekPerOneLp(
    farmData,
    APT_AMNIS_STAPT_FARM.rewardTokenInfo
  );

  const liquidityPoolData = await fetchLiquidityPoolData(
    APT_AMNIS_STAPT_FARM.coinX.type,
    APT_AMNIS_STAPT_FARM.coinY.type,
    APT_AMNIS_STAPT_FARM.curve,
    APT_AMNIS_STAPT_FARM.resourceAccount,
    APT_AMNIS_STAPT_FARM.moduleAccount
  );

  const liquidityPoolTotalMintedLP = await fetchPoolTotalMintedLP(
    APT_AMNIS_STAPT_FARM.coinX.type,
    APT_AMNIS_STAPT_FARM.coinY.type,
    APT_AMNIS_STAPT_FARM.curve,
    APT_AMNIS_STAPT_FARM.resourceAccount
  );

  const poolTokensPrices = await utils.getPrices([
    `coingecko:${APT_AMNIS_STAPT_FARM.rewardTokenInfo.coinGeckoId}`,
    `coingecko:${APT_AMNIS_STAPT_FARM.coinX.coinGeckoId}`,
    `coingecko:${APT_AMNIS_STAPT_FARM.coinY.coinGeckoId}`,
  ]);

  const rewardTokenPriceValue =
    poolTokensPrices.pricesByAddress[
      APT_AMNIS_STAPT_FARM.rewardTokenInfo.coinGeckoId
    ];

  const rewardPerWeekHumanReadable = getAmountWithDecimal(
    rewardPerWeekPerOneLP,
    APT_AMNIS_STAPT_FARM.rewardTokenInfo.decimals
  );

  const rewardPerWeekInUSD = getUSDEquivalent(
    rewardPerWeekHumanReadable,
    rewardTokenPriceValue
  );

  const oneLPHumanReadableValue = decimalsMultiplier(LP_DECIMALS).toNumber();

  const afterBurnOneLpValue = calcOutputBurnLiquidity({
    xReserve: liquidityPoolData.coinXReserves,
    yReserve: liquidityPoolData.coinYReserves,
    lpSupply: liquidityPoolTotalMintedLP,
    toBurn: oneLPHumanReadableValue,
  });

  const oneLpXRateHumanReadable = getAmountWithDecimal(
    afterBurnOneLpValue.x,
    APT_AMNIS_STAPT_FARM.coinX.decimals
  );

  const oneLpYRateHumanReadable = getAmountWithDecimal(
    afterBurnOneLpValue.y,
    APT_AMNIS_STAPT_FARM.coinY.decimals
  );

  const oneLpXRateInUSD = getUSDEquivalent(
    oneLpXRateHumanReadable,
    poolTokensPrices.pricesByAddress[APT_AMNIS_STAPT_FARM.coinX.coinGeckoId]
  );

  const oneLpYRateInUSD = getUSDEquivalent(
    oneLpYRateHumanReadable,
    poolTokensPrices.pricesByAddress[APT_AMNIS_STAPT_FARM.coinY.coinGeckoId]
  );

  const oneLpInUSD = oneLpXRateInUSD + oneLpYRateInUSD;

  const APR = ((rewardPerWeekInUSD / oneLpInUSD) * 100 * 365) / 7;
}

main();

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.thala.fi/pools',
};
