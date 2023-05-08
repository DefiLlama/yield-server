const { lookupApplications } = require('../helper/chain/algorand');
const { oracleDecimals } = require('./constants');

const SECONDS_IN_YEAR = BigInt(365 * 24 * 60 * 60);
const HOURS_IN_YEAR = BigInt(365 * 24);

const ONE_2_DP = BigInt(1e2);
const ONE_4_DP = BigInt(1e4);
const ONE_10_DP = BigInt(1e10);
const ONE_14_DP = BigInt(1e14);
const ONE_16_DP = BigInt(1e16);

const UINT64 = BigInt(2) << BigInt(63);
const UINT128 = BigInt(2) << BigInt(127);

function maximum(n1, n2) {
  return n1 > n2 ? n1 : n2;
}

function fromIntToBytes8Hex(num) {
  return num.toString(16).padStart(16, '0');
}

function fromIntToByteHex(num) {
  return num.toString(16).padStart(2, '0');
}

function encodeToBase64(str, encoding = 'utf8') {
  return Buffer.from(str, encoding).toString('base64');
}

function parseOracleValue(base64Value) {
  const value = Buffer.from(base64Value, 'base64').toString('hex');
  // first 8 bytes are the price
  const price = BigInt('0x' + value.slice(0, 16));

  return price;
}

function getParsedValueFromState(state, key, encoding = 'utf8') {
  const encodedKey = encoding ? encodeToBase64(key, encoding) : key;
  const keyValue = state.find((entry) => entry.key === encodedKey);
  if (keyValue === undefined) return;
  const { value } = keyValue;
  if (value.type === 1) return value.bytes;
  if (value.type === 2) return BigInt(value.uint);
  return;
}

async function getAppState(appId) {
  const res = await lookupApplications(appId);
  return res.application.params['global-state'];
}

/**
 * Calculate the sqrt of a bigint (rounded down to nearest integer)
 * @param value value to be square-rooted
 * @return bigint sqrt
 */
function sqrt(value) {
  if (value < BigInt(0))
    throw Error('square root of negative numbers is not supported');

  if (value < BigInt(2)) return value;

  function newtonIteration(n, x0) {
    const x1 = (n / x0 + x0) >> BigInt(1);
    if (x0 === x1 || x0 === x1 - BigInt(1)) return x0;
    return newtonIteration(n, x1);
  }

  return newtonIteration(value, BigInt(1));
}

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

function calculateInterestYield(value) {
  return (
    expBySquaring(ONE_16_DP + value / HOURS_IN_YEAR, HOURS_IN_YEAR, ONE_16_DP) -
    ONE_16_DP
  );
}

function calculateVariableBorrowInterestYield(value) {
  return (
    expBySquaring(
      ONE_16_DP + value / SECONDS_IN_YEAR,
      SECONDS_IN_YEAR,
      ONE_16_DP
    ) - ONE_16_DP
  );
}

function interestRateToPercentage(interestRate, decimals = 2) {
  const percentage = Number(interestRate) / Number(ONE_14_DP);
  return Number(percentage.toFixed(decimals));
}

function ratioToPercentage(ratio) {
  const percentage = Number(ratio) / Number(ONE_4_DP);
  return Number(percentage.toFixed(2));
}

function calcDepositInterestIndex(dirt1, diit1, latestUpdate) {
  const dt = BigInt(unixTime()) - latestUpdate;
  return mulScale(diit1, ONE_16_DP + (dirt1 * dt) / SECONDS_IN_YEAR, ONE_16_DP);
}

function unixTime() {
  return Math.floor(Date.now() / 1000);
}

function parseUint64s(base64Value) {
  const value = Buffer.from(base64Value, 'base64').toString('hex');

  // uint64s are 8 bytes each
  const uint64s = [];
  for (let i = 0; i < value.length; i += 16) {
    uint64s.push(BigInt('0x' + value.slice(i, i + 16)));
  }
  return uint64s;
}

function calcWithdrawReturn(withdrawAmount, diit) {
  return mulScale(withdrawAmount, diit, ONE_14_DP);
}

function transformPrice(assetPrice) {
  return Number(assetPrice) / 10 ** oracleDecimals;
}

function getRewardInterestRate(
  stakedAmountValue,
  rewardRate,
  rewardAssetPrice,
  endTimestamp
) {
  return unixTime() < endTimestamp && stakedAmountValue !== BigInt(0)
    ? (rewardRate * BigInt(1e6) * rewardAssetPrice * SECONDS_IN_YEAR) /
        stakedAmountValue
    : BigInt(0);
}

module.exports = {
  maximum,
  fromIntToBytes8Hex,
  fromIntToByteHex,
  parseOracleValue,
  getParsedValueFromState,
  getAppState,
  calculateInterestYield,
  calculateVariableBorrowInterestYield,
  interestRateToPercentage,
  calcDepositInterestIndex,
  parseUint64s,
  calcWithdrawReturn,
  transformPrice,
  getRewardInterestRate,
  ratioToPercentage,
};
