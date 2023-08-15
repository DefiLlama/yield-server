const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const queries = require('./queries');
const cellarAbi = require('./cellar-v2.json');
const { chain, realYieldEth } = require('./config');

const call = sdk.api.abi.call;

const abiAsset = cellarAbi.find((el) => el.name === 'asset');
const getPositionAssets = cellarAbi.find(
  (el) => el.name === 'getPositionAssets'
);

const windowInHrs = 48; // 2 days
const dayInSec = 60 * 60 * 24; // 1 day in seconds

// Calculate daily APY given a start and end time in seconds since epoch
// APY should only be calculated with data from a full day. To calculate today's
// APY, use the complete data from the previous 2 days.
async function calcApy(cellarAddress, startEpochSecs, endEpochSecs) {
  // Returns hourData in desc order, current hour is index 0
  const hrData = await queries.getHourData(
    cellarAddress,
    startEpochSecs,
    endEpochSecs
  );

  // How many seconds have elapsed today
  const remainder = endEpochSecs % dayInSec;
  // Start of the 2nd day
  const startOfEnd =
    remainder === 0 ? endEpochSecs - dayInSec : endEpochSecs - remainder;

  // Bucket hr datas by date
  const dayBefore = hrData.filter((data) => data.date >= startOfEnd);
  const twoDaysBefore = hrData.filter((data) => data.date < startOfEnd);

  // Sum hourly price of the last 2 days individually
  let sumPrice = dayBefore.reduce((memo, data) => {
    return memo.plus(data.shareValue);
  }, new BigNumber(0));

  let sumPrevPrice = twoDaysBefore.reduce((memo, data) => {
    return memo.plus(data.shareValue);
  }, new BigNumber(0));

  // Calculate yesterday's yield
  const price = sumPrice.div(dayBefore.length);
  const prevPrice = sumPrevPrice.div(twoDaysBefore.length);
  const yieldRatio = price.minus(prevPrice).div(prevPrice);

  const result = yieldRatio.times(365).times(100).toNumber();

  return Number.isNaN(result) ? 0 : result;
}

// Use the change in avg daily price between the last 2 days to calculate an APR
async function getApy(cellarAddress) {
  const now = Math.floor(Date.now() / 1000);
  const remainder = now % dayInSec;
  const end = now - remainder - 1;
  const start = end - dayInSec - dayInSec + 1;

  return calcApy(cellarAddress, start, end);
}

const windowInDays = 7;

async function getApy7d(cellarAddress) {
  // Returns dayData in desc order, today is index 0
  const dayData = await queries.getDayData(cellarAddress, windowInDays);

  // Need a minimum of 7 days to calculate yield
  if (dayData.length < 7) {
    return 0;
  }

  const price = new BigNumber(dayData[0].shareValue); // Now price
  const prevPrice = new BigNumber(dayData[dayData.length - 1].shareValue); // Comparison price
  const yieldRatio = price.minus(prevPrice).div(prevPrice);

  const result = yieldRatio.times(52).times(100).toNumber();
  return Number.isNaN(result) ? 0 : result;
}

// Call getPositionAssets to get all the credit position's underlying assets
async function getUnderlyingTokens(cellarAddress) {
  const assets = (
    await call({
      target: cellarAddress,
      abi: getPositionAssets,
      chain,
    })
  ).output;

  // dedupe, different positions may have the same underlying
  return [...new Set(assets)];
}

async function getHoldingPosition(cellarAddress) {
  if (cellarAddress === realYieldEth) {
    // WETH
    // We need to hardcode this temporarily since the holding position was changed
    // to the vesting position in order to block deposits. Otherwise, the call below
    // will revert and it will break.
    return '0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  }

  const asset = (
    await call({
      target: cellarAddress,
      abi: abiAsset,
      chain,
    })
  ).output;

  return asset;
}

module.exports = {
  calcApy,
  getApy,
  getApy7d,
  getHoldingPosition,
  getUnderlyingTokens,
};
