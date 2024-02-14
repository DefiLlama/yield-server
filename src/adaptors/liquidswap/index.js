const utils = require('../utils');
const { BigNumber } = require('bignumber.js');
const {
  FARMS,
  NODE_URL,
  APT_AMNIS_STAPT_FARM: farmPool,
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
  for (let farmPool of FARMS) {
    const decimalsReward = decimalsMultiplier(
      farmPool.rewardTokenInfo.decimals
    ).toNumber();

    const farmData = await fetchFarmPoolData(
      farmPool.deployedAddress,
      farmPool.coinX.type,
      farmPool.coinY.type,
      farmPool.curve,
      farmPool.rewardTokenInfo.type,
      farmPool.resourceAccount
    );

    const rewardPerWeekPerOneLP = calcRewardPerWeekPerOneLp(
      farmData,
      farmPool.rewardTokenInfo
    );

    const liquidityPoolData = await fetchLiquidityPoolData(
      farmPool.coinX.type,
      farmPool.coinY.type,
      farmPool.curve,
      farmPool.resourceAccount,
      farmPool.moduleAccount
    );

    const liquidityPoolTotalMintedLP = await fetchPoolTotalMintedLP(
      farmPool.coinX.type,
      farmPool.coinY.type,
      farmPool.curve,
      farmPool.resourceAccount
    );

    const poolTokensPrices = await utils.getPrices([
      `coingecko:${farmPool.rewardTokenInfo.coinGeckoId}`,
      `coingecko:${farmPool.coinX.coinGeckoId}`,
      `coingecko:${farmPool.coinY.coinGeckoId}`,
    ]);

    const rewardTokenPriceValue =
      poolTokensPrices.pricesByAddress[farmPool.rewardTokenInfo.coinGeckoId];

    const rewardPerWeekHumanReadable = getAmountWithDecimal(
      rewardPerWeekPerOneLP,
      farmPool.rewardTokenInfo.decimals
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
      farmPool.coinX.decimals
    );

    const oneLpYRateHumanReadable = getAmountWithDecimal(
      afterBurnOneLpValue.y,
      farmPool.coinY.decimals
    );

    const oneLpXRateInUSD = getUSDEquivalent(
      oneLpXRateHumanReadable,
      poolTokensPrices.pricesByAddress[farmPool.coinX.coinGeckoId]
    );

    const oneLpYRateInUSD = getUSDEquivalent(
      oneLpYRateHumanReadable,
      poolTokensPrices.pricesByAddress[farmPool.coinY.coinGeckoId]
    );

    const oneLpInUSD = oneLpXRateInUSD + oneLpYRateInUSD;

    const APR = ((rewardPerWeekInUSD / oneLpInUSD) * 100 * 365) / 7;
  }
}

main();

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.thala.fi/pools',
};
