const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { lambertW0 } = require('lambert-w-function');

const abi = require('./abi');
const {
  LUSD_ADDRESS,
  BLUSD_ADDRESS,
  BLUSD_LUSD_3CRV_POOL_ADDRESS,
  LUSD_3CRV_POOL_ADDRESS,
  CHICKEN_BOND_MANAGER_ADDRESS,
  CURVE_REGISTRY_SWAPS_ADDRESS,
} = require('./addresses');

const getLusdUsdPrice = async () => {
  return (
    await superagent.get(
      `https://coins.llama.fi/prices/current/ethereum:${LUSD_ADDRESS}`
    )
  ).body.coins[`ethereum:${LUSD_ADDRESS}`].price;
};

const contractCall = async (address, functionAbi, params = undefined) => {
  return (
    await sdk.api.abi.call({
      target: address,
      abi: functionAbi,
      chain: 'ethereum',
      params,
    })
  ).output;
};

const _getAverageBondAgeInSeconds = async () => {
  const totalWeightedStartTimes =
    (await contractCall(
      CHICKEN_BOND_MANAGER_ADDRESS,
      abi.chickenBondManager.totalWeightedStartTimes
    )) / 1e18;

  const pendingBucketLusd =
    (await contractCall(
      CHICKEN_BOND_MANAGER_ADDRESS,
      abi.chickenBondManager.getPendingLUSD
    )) / 1e18;

  const averageStartTimeinMilliseconds =
    Math.round(totalWeightedStartTimes / pendingBucketLusd) * 1000;
  const averageBondAgeInSeconds =
    Math.round(Date.now() - averageStartTimeinMilliseconds) / 1000;

  return averageBondAgeInSeconds;
};

const _secondsToDays = (seconds) => seconds / 60 / 60 / 24;

const _getDaysUntilControllerStartsAdjusting = async (
  targetBondAgeInSeconds
) => {
  const averageBondAgeInSeconds = (await _getAverageBondAgeInSeconds()) / 1e18;
  const secondsUntil =
    targetBondAgeInSeconds > averageBondAgeInSeconds
      ? targetBondAgeInSeconds - averageBondAgeInSeconds
      : 0;
  const daysUntil = _secondsToDays(secondsUntil);
  return daysUntil;
};

const _getControllerAdjustedRebondDays = async (rebondPeriodInDays) => {
  const targetBondAgeInSeconds =
    (await contractCall(
      CHICKEN_BOND_MANAGER_ADDRESS,
      abi.chickenBondManager.targetAverageAgeSeconds
    )) / 1e18;
  const daysUntilControllerStartsAdjusting =
    await _getDaysUntilControllerStartsAdjusting(targetBondAgeInSeconds);
  const rebondDaysRemaining = rebondPeriodInDays;

  if (rebondDaysRemaining < daysUntilControllerStartsAdjusting) {
    return rebondDaysRemaining;
  }

  const lambertDividend = rebondPeriodInDays * Math.log(0.99);
  const lambertDivisor = 0.99 ** daysUntilControllerStartsAdjusting;
  const lambertQuotient = lambertW0(-(lambertDividend / lambertDivisor));

  const formulaDividend =
    lambertQuotient + Math.log(0.99) * daysUntilControllerStartsAdjusting;

  const formulaDivisor = Math.log(0.99);

  const controlledAdjustedRebondDays = -(formulaDividend / formulaDivisor);

  return controlledAdjustedRebondDays;
};

const _getBLusdMarketPrice = async () => {
  const marginalInputAmount = 0x038d7ea4c68000; // == 1/1000 in hex;

  const marginalOutputAmount = await contractCall(
    CURVE_REGISTRY_SWAPS_ADDRESS,
    abi.curveRegistrySwaps.get_exchange_multiple_amount,
    [
      [
        BLUSD_ADDRESS,
        BLUSD_LUSD_3CRV_POOL_ADDRESS,
        LUSD_3CRV_POOL_ADDRESS,
        LUSD_3CRV_POOL_ADDRESS,
        LUSD_ADDRESS,
        '0x0000000000000000000000000000000000000000',
        '0x0000000000000000000000000000000000000000',
        '0x0000000000000000000000000000000000000000',
        '0x0000000000000000000000000000000000000000',
      ],
      [
        [0, 1, 3],
        [0, 0, 9],
        [0, 0, 0],
        [0, 0, 0],
      ],
      marginalInputAmount,
    ]
  );

  const marketPrice = marginalOutputAmount / marginalInputAmount;

  return marketPrice;
};

const getRebondApy = async () => {
  const alphaAccrualFactor =
    (await contractCall(
      CHICKEN_BOND_MANAGER_ADDRESS,
      abi.chickenBondManager.calcUpdatedAccrualParameter
    )) /
    1e18 /
    (24 * 60 * 60);

  const chickenInFee =
    (await contractCall(
      CHICKEN_BOND_MANAGER_ADDRESS,
      abi.chickenBondManager.CHICKEN_IN_AMM_FEE
    )) / 1e18;

  const floorPrice =
    (await contractCall(
      CHICKEN_BOND_MANAGER_ADDRESS,
      abi.chickenBondManager.calcSystemBackingRatio
    )) / 1e18;

  const marketPrice = await _getBLusdMarketPrice();

  const marketPricePremium = (marketPrice / floorPrice) * (1 - chickenInFee);

  const rebondPeriodInDays =
    alphaAccrualFactor *
    ((1 + Math.sqrt(marketPricePremium)) / (marketPricePremium - 1));

  const controllerAdjustedRebondPeriodInDays =
    await _getControllerAdjustedRebondDays(rebondPeriodInDays);

  const rebondPeriodAccrualFactor =
    (1 / floorPrice) *
    (rebondPeriodInDays / (rebondPeriodInDays + alphaAccrualFactor));

  const rebondRoi =
    (1 - chickenInFee) * rebondPeriodAccrualFactor * marketPrice - 1;

  const rebondApr = rebondRoi * (365 / controllerAdjustedRebondPeriodInDays);

  const rebondApy =
    (1 + rebondApr / (365 / controllerAdjustedRebondPeriodInDays)) **
      (365 / controllerAdjustedRebondPeriodInDays) -
    1;

  return rebondApy * 100;
};

module.exports = { getLusdUsdPrice, getRebondApy, contractCall };
