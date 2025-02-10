const axios = require('axios');
const { ONE_18_DP, EVERY_SECOND } = require('./constants');

const getPrices = async (tokenPriceKeys) =>
  (
    await axios.get(
      `https://coins.llama.fi/prices/current/${tokenPriceKeys
        .join(',')
        .toLowerCase()}`
    )
  ).data.coins;

const toUsdValue = (value, price, decimals) => {
  return (parseFloat(value) * price) / Math.pow(10, decimals);
};

const overallBorrowInterestRate = (
  varBorrowInterestRate,
  varBorrowTotalAmount,
  stblBorrowInterestRate,
  stblBorrowTotalAmount
) => {
  const totalDebt = varBorrowTotalAmount + stblBorrowTotalAmount;
  if (totalDebt === BigInt(0)) return BigInt(0);
  return (
    (varBorrowInterestRate * varBorrowTotalAmount +
      stblBorrowInterestRate * stblBorrowTotalAmount) /
    totalDebt
  );
};

function mulScale(n1, n2, scale) {
  return (n1 * n2) / scale;
}

function expBySquaring(x, n, scale) {
  if (n === BigInt(0)) return scale;

  let y = scale;
  while (n > BigInt(1)) {
    if (n % BigInt(2)) {
      y = mulScale(x, y, scale);
      n = (n - BigInt(1)) / BigInt(2);
    } else {
      n = n / BigInt(2);
    }
    x = mulScale(x, x, scale);
  }
  return mulScale(x, y, scale);
}

function calculateInterestYield(value, freq, scale) {
  return expBySquaring(scale + value / freq, freq, scale) - scale;
}

function interestRateToPercentage(interestRate, decimals = 5) {
  const percentage = Number(interestRate) / Number(ONE_18_DP);
  return Number(percentage.toFixed(decimals)) * 100;
}

function calculateInterestYieldPercentage(value, freq, scale) {
  return interestRateToPercentage(calculateInterestYield(value, freq, scale));
}

function calculateRewardAprPercentage(
  rewardsAmount,
  rewardsTokenPrice,
  rewardsTokenDecimals,
  totalSupplyUsd,
  remainingTime
) {
  return (
    (toUsdValue(rewardsAmount, rewardsTokenPrice, rewardsTokenDecimals) /
      totalSupplyUsd) *
    (Number(EVERY_SECOND) / Number(remainingTime)) *
    100
  );
}
module.exports = {
  toUsdValue,
  overallBorrowInterestRate,
  calculateInterestYield,
  calculateInterestYieldPercentage,
  interestRateToPercentage,
  getPrices,
  calculateRewardAprPercentage,
};
