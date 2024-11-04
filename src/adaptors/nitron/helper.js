const BigNumber = require('bignumber.js');
const { default: axios } = require('axios');
const dayjs = require('dayjs');

const BN_ZERO = new BigNumber(0);
const BN_ONE = new BigNumber(1);
const modAddress = 'swth1wq9ts6l7atfn45ryxrtg4a2gwegsh3xh7w83xl';
const cdpModAddress = 'swth1zkmw9w5j0ew57hzsvcwautrsfpcq7z5zffvaqe';

const secondsInMinBN = new BigNumber(60);
const secondsInHourBN = secondsInMinBN.multipliedBy(60);
const secondsInDayBN = secondsInHourBN.multipliedBy(24);
const secondsInYearBN = secondsInDayBN.multipliedBy(365);

const bnOrZero = (number) => {
  return new BigNumber(number ?? 0);
};

function getRewardSchemeKey(denom, type) {
  return `${denom}:${type}`;
}

function getProjectedRewardsOwed(rewardScheme, tokenPrices) {
  const rewardUsdValue = tokenPrices[rewardScheme.reward_denom]?.usd ?? 1;
  const rewardAmountPerSecond = bnOrZero(rewardScheme.reward_amount_per_second);
  const projectedRewardsOwed = rewardAmountPerSecond.times(secondsInYearBN);
  return projectedRewardsOwed.times(rewardUsdValue);
}

const getRewardMap = async (rewardSchemes, tokenPrices) => {
  const schemesArr = Object.values(rewardSchemes);
  const activeSchemes = schemesArr.filter((rewardScheme) => {
    const start = Math.floor(
      new Date(rewardScheme.start_time).getTime() / 1000
    );
    const end = Math.floor(new Date(rewardScheme.end_time).getTime() / 1000);
    const now = Math.floor(Date.now() / 1000);
    return now >= start && now < end;
  });
  const rewardsUSDMap = {};
  for (let ii = 0; ii < activeSchemes.length; ii++) {
    const indivScheme = activeSchemes[ii];
    // get projected rewards earned in 1 year
    const projectedRewardsOwedRaw = getProjectedRewardsOwed(
      indivScheme,
      tokenPrices
    );
    let underlyingDenom = indivScheme.asset_denom.replace('cibt/', '');

    const schemeKey = `${underlyingDenom}:${indivScheme.reward_type}`;
    if (!rewardsUSDMap[schemeKey]) {
      rewardsUSDMap[schemeKey] = {};
    }

    if (rewardsUSDMap[schemeKey][indivScheme.reward_denom]) {
      rewardsUSDMap[schemeKey] = {
        ...rewardsUSDMap[schemeKey],
        [indivScheme.reward_denom]: rewardsUSDMap[schemeKey][
          indivScheme.reward_denom
        ].plus(projectedRewardsOwedRaw),
      };
    } else {
      rewardsUSDMap[schemeKey] = {
        ...rewardsUSDMap[schemeKey],
        [indivScheme.reward_denom]: projectedRewardsOwedRaw,
      };
    }
  }
  return rewardsUSDMap;
};

module.exports.getTokenAprArr = async (
  rewardSchemes,
  tokenPrices,
  tokens,
  type,
  underlyingDenom,
  totalSharesUSD
) => {
  const addRewardsUsd = await getRewardMap(rewardSchemes, tokenPrices);
  const schemeKey = `${underlyingDenom}:${type}`;
  const rewardsMap = addRewardsUsd[schemeKey] ?? {};
  const totalSharesUSDBN = new BigNumber(totalSharesUSD);
  let totalRewardUsd = BN_ZERO;
  const tokenAprArr = Object.keys(rewardsMap).reduce((prev, rewardKey) => {
    const newPrev = [...prev];
    const rewardDecimals = tokens.find((o) => o.denom === rewardKey).decimals;
    const rewardUsd = (rewardsMap[rewardKey] ?? BN_ZERO).shiftedBy(
      -rewardDecimals
    );
    totalRewardUsd = totalRewardUsd.plus(rewardUsd);
    newPrev.push({
      denom: rewardKey,
      apr: totalSharesUSDBN.isZero()
        ? BN_ZERO
        : rewardUsd.div(totalSharesUSDBN),
    });
    return newPrev;
  }, []);
  return {
    tokenAprArr: tokenAprArr,
    overallRewardApr: totalSharesUSDBN.isZero()
      ? BN_ZERO
      : totalRewardUsd.div(totalSharesUSDBN),
  };
};

module.exports.getAllBorrowAssets = async () => {
  const allAssets = (
    await axios.get('https://api.carbon.network/carbon/cdp/v1/asset')
  ).data.asset_params_all;
  return allAssets;
};
module.exports.getDebtInfos = async () => {
  const debtInfos = (
    await axios.get('https://api.carbon.network/carbon/cdp/v1/token_debt')
  ).data.debt_infos_all;
  return debtInfos;
};
module.exports.getModBalances = async () => {
  const modBalances = (
    await axios.get(
      `https://api.carbon.network/carbon/coin/v1/balances/${modAddress}`
    )
  ).data.token_balances;
  return modBalances;
};

module.exports.getCdpModBalances = async () => {
  const cdpModBalances = (
    await axios.get(
      `https://api.carbon.network/carbon/coin/v1/balances/${cdpModAddress}`
    )
  ).data.token_balances;
  return cdpModBalances;
};

module.exports.getCdpTotalSupply = async () => {
  const cdpTotalSupply = (
    await axios.get(
      `https://api.carbon.network/cosmos/bank/v1beta1/supply?pagination.limit=100000`
    )
  ).data.supply;
  return cdpTotalSupply;
};

module.exports.getAllStrats = async () => {
  const allStrategies = (
    await axios.get(`https://api.carbon.network/carbon/cdp/v1/rate_strategy`)
  ).data.rate_strategy_params_all;
  return allStrategies;
};

module.exports.getParams = async () => {
  const params = (
    await axios.get(`https://api.carbon.network/carbon/cdp/v1/params`)
  ).data.params;
  return params;
};

module.exports.getRewardSchemes = async () => {
  const rewardSchemes = (
    await axios.get(`https://api.carbon.network/carbon/cdp/v1/reward_schemes`)
  ).data.reward_schemes;
  return rewardSchemes;
};

module.exports.getUSDValues = async (assets, denomToGeckoIdMap) => {
  const priceKeys = [
    ...new Set(assets.map((a) => `coingecko:${denomToGeckoIdMap[a.denom]}`)),
  ].filter((i) => i !== undefined);

  const prices = (
    await axios.get(
      `https://coins.llama.fi/prices/current/${priceKeys.join(',')}`
    )
  ).data.coins;

  const pricingsFromOracle = (
    await axios.get('https://api.carbon.network/carbon/pricing/v1/token_price')
  ).data?.token_prices;

  let result = {};
  assets.forEach((asset) => {
    const denomtInGeckoId = denomToGeckoIdMap[asset.denom];
    let usd = prices[`coingecko:${denomtInGeckoId}`]?.price;
    if (!usd)
      usd = Number(
        pricingsFromOracle.find((o) => o.denom === asset.denom)?.twap
      );
    result[asset.denom] = { ...asset, usd };
  });
  return result;
};

module.exports.calculateInterestAPY = (debtInfo, rateStrategy) => {
  const utilizationRate = bnOrZero(debtInfo.utilization_rate);
  const optimalUsage = bnOrZero(rateStrategy.optimal_usage).shiftedBy(-4);
  const variableRate1 = bnOrZero(rateStrategy.variable_rate_slope_1).shiftedBy(
    -4
  );
  const variableRate2 = bnOrZero(rateStrategy.variable_rate_slope_2).shiftedBy(
    -4
  );
  const baseVariableBorrowRate = bnOrZero(
    rateStrategy.base_variable_borrow_rate
  ).shiftedBy(-4);
  if (utilizationRate.lte(optimalUsage)) {
    const vRate = utilizationRate
      .times(variableRate1)
      .div(optimalUsage)
      .dp(4, BigNumber.ROUND_CEIL);
    return vRate.plus(baseVariableBorrowRate);
  } else {
    const ratio = utilizationRate
      .minus(optimalUsage)
      .div(BN_ONE.minus(optimalUsage));
    const vRate = ratio
      .times(variableRate2)
      .plus(variableRate1)
      .dp(4, BigNumber.ROUND_CEIL);
    return vRate.plus(baseVariableBorrowRate);
  }
};

module.exports.calculateLendAPY = (borrowInterest, debtInfo, params) => {
  const interestFeeRate = bnOrZero(params.interest_fee).div(
    new BigNumber(10000)
  );
  const utilizationRate = bnOrZero(debtInfo.utilization_rate);
  return borrowInterest
    .times(utilizationRate)
    .times(BN_ONE.minus(interestFeeRate));
};

const calculateInterestForTimePeriod = (offsetSeconds, debtInfo, borrowAPY) => {
  const interestAPY = new BigNumber(borrowAPY);

  const now = dayjs().add(offsetSeconds, 'seconds').toDate();
  const lastDate = debtInfo.last_updated_time ?? now;
  const diffMs = end.getTime() - start.getTime();
  if (diffMs <= 0) {
    return BN_ZERO;
  }
  const diffSeconds = new BigNumber(diffMs)
    .shiftedBy(-3)
    .dp(0, BigNumber.ROUND_CEIL);
  const secondsAYear = bnOrZero(31536000);
  const numPeriods = secondsAYear.div(diffSeconds).dp(18);
  return interestAPY.div(numPeriods).dp(18); // carbon backend sdk.dec max 18 dp
};

const getTotalDebt = (offsetSeconds, debtInfo, params, borrowAPY) => {
  if (debtInfo) return BN_ZERO;
  const totalUnderlyingPrincipal = bnOrZero(debtInfo.total_principal);
  const interestRate = calculateInterestForTimePeriod(offsetSeconds);
  const accumInterest = bnOrZero(debtInfo.total_accumulated_interest);

  const newInterest = totalUnderlyingPrincipal
    .times(interestRate)
    .plus(accumInterest.times(BN_ONE.plus(interestRate)));
  const interest = newInterest.times(BN_ONE.minus(params.interest_fee)).dp(0);
  return totalUnderlyingPrincipal.plus(interest);
};

const getCdpRatio = (
  debtInfo,
  params,
  borrowAPY,
  cdpModuleUnderlyingBalance,
  cdpTotalSupply
) => {
  const totalDebt = getTotalDebt(
    (offsetSeconds = 0),
    debtInfo,
    params,
    borrowAPY
  );
  const totalUnderlying = BigNumber.sum(cdpModuleUnderlyingBalance, totalDebt);
  const cdpRatio = totalUnderlying.isZero()
    ? BN_ONE
    : cdpTotalSupply.div(totalUnderlying);
  return cdpRatio;
};

module.exports.getTotalCdpSharesUSD = (
  debtInfo,
  params,
  borrowAPY,
  decimals,
  totalSupplyBN,
  cdpModBalances,
  usd
) => {
  const cdpRatio = getCdpRatio(
    debtInfo,
    params,
    borrowAPY,
    cdpModBalances,
    totalSupplyBN
  );
  const underlyingAmount = !cdpRatio.isFinite()
    ? totalSupplyBN.div(cdpRatio)
    : totalSupplyBN;
  return underlyingAmount.times(usd).shiftedBy(-decimals);
};
