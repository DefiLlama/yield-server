const { BigNumber } = require('bignumber.js');
const utils = require('../utils');
const {
  FARMS,
  LP_DECIMALS,
  UNCORRELATED_CURVE
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
  fetchFarmPoolData,
  fetchLiquidityPoolData,
  fetchPoolTotalMintedLP,
  getAPRsFromSentio,
} = require('./api');

async function getAPRandTVL(farmPool) {
  // calc ARP
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

  const liquidityPoolTotalMintedLPValue = await fetchPoolTotalMintedLP(
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
    lpSupply: liquidityPoolTotalMintedLPValue,
    toBurn: oneLPHumanReadableValue,
  });

  const oneLpXRateHumanReadableAPR = getAmountWithDecimal(
    afterBurnOneLpValue.x,
    farmPool.coinX.decimals
  );

  const oneLpYRateHumanReadableAPR = getAmountWithDecimal(
    afterBurnOneLpValue.y,
    farmPool.coinY.decimals
  );

  const oneLpXRateInUSD = getUSDEquivalent(
    oneLpXRateHumanReadableAPR,
    poolTokensPrices.pricesByAddress[farmPool.coinX.coinGeckoId]
  );

  const oneLpYRateInUSD = getUSDEquivalent(
    oneLpYRateHumanReadableAPR,
    poolTokensPrices.pricesByAddress[farmPool.coinY.coinGeckoId]
  );

  const oneLpInUSD = oneLpXRateInUSD + oneLpYRateInUSD;

  const APR = ((rewardPerWeekInUSD / oneLpInUSD) * 100 * 365) / 7;

  // calc TVL
  const TVLCalculationData = calcOutputBurnLiquidity({
    xReserve: liquidityPoolData.coinXReserves,
    yReserve: liquidityPoolData.coinYReserves,
    lpSupply: liquidityPoolTotalMintedLPValue,
    toBurn: farmData.stakeCoins,
  });

  const oneLpXRateHumanReadableTVL = getAmountWithDecimal(
    TVLCalculationData.x,
    farmPool.coinX.decimals
  );

  const oneLpYRateHumanReadableTVL = getAmountWithDecimal(
    TVLCalculationData.y,
    farmPool.coinY.decimals
  );

  const oneLpXRateInUSDTVL = getUSDEquivalent(
    oneLpXRateHumanReadableTVL,
    poolTokensPrices.pricesByAddress[farmPool.coinX.coinGeckoId]
  );

  const oneLpYRateInUSDTVL = getUSDEquivalent(
    oneLpYRateHumanReadableTVL,
    poolTokensPrices.pricesByAddress[farmPool.coinY.coinGeckoId]
  );

  const TVL = oneLpXRateInUSDTVL + oneLpYRateInUSDTVL;

  return {
    apr: APR,
    tvl: TVL,
  };
}

async function main() {
  const pools = [];

  for (let farmPool of FARMS) {
    const farmPoolInfo = await getAPRandTVL(farmPool);
    const { coinX, coinY, uniqueFarmKey  } = farmPool;

    pools.push({
      pool: uniqueFarmKey,
      chain: utils.formatChain('aptos'),
      project: 'liquidswap',
      symbol: `${coinX.symbol}-${coinY.symbol}`,
      tvlUsd: farmPoolInfo.tvl,
      apy: farmPoolInfo.apr,
    });
  }

  return pools;
}

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://farms.liquidswap.com/#/stakes',
};
