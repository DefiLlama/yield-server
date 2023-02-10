const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const queries = require('./queries');
const cellarAbi = require('./cellar-v2.json');
const { chain } = require('./config');

const call = sdk.api.abi.call;

const abiAsset = cellarAbi.find((el) => el.name === 'asset');
const getPositionAssets = cellarAbi.find(
  (el) => el.name === 'getPositionAssets'
);

const windowInHrs = 48; // 2 days
const dayInSec = 60 * 60 * 24; // 1 day in seconds

async function calcApy(cellarAddress, startEpochSecs, endEpochSecs) {
  // Returns hourData in desc order, current hour is index 0
  const hrData = await queries.getHourData(
    cellarAddress,
    startEpochSecs,
    endEpochSecs
  );

  const remainder = endEpochSecs % dayInSec;
  const startOfEnd =
    remainder === 0 ? endEpochSecs - dayInSec : endEpochSecs - remainder;

  // TODO: What should we do for the first two days?
  // set launch date 2 days after actual launch
  // if (now < launchDate + 2) { return 0; }

  // Bucket hr datas by day
  const dayBefore = [];
  const twoDaysBefore = [];
  hrData.forEach((data) => {
    if (data.date < startOfEnd) {
      twoDaysBefore.push(data);
    } else {
      dayBefore.push(data);
    }
  });

  // Sum hourly price of the last 2 days individually
  let sumPrice = dayBefore.reduce((memo, data) => {
    return memo.plus(data.shareValue);
  }, new BigNumber(0));

  let sumPrevPrice = twoDaysBefore.reduce((memo, data) => {
    return memo.plus(data.shareValue);
  }, new BigNumber(0));

  const price = sumPrice.div(dayBefore.length);
  const prevPrice = sumPrevPrice.div(twoDaysBefore.length);
  const yieldRatio = price.minus(prevPrice).div(prevPrice);

  return yieldRatio.times(365).times(100).toNumber();
}

// Use the change in avg daily price between the last 2 days to calculate an APR
// If there isn't at least 48 hours of hour data then we shold set the pool property
// `apyBaseInception` to the backtested APY
async function getApy(cellarAddress) {
  const now = Math.floor(Date.now() / 1000);
  const mod = now % dayInSec;
  const end = now - mod - 1;
  const start = end - dayInSec - dayInSec + 1;

  return calcApy(start, end);
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

  return yieldRatio.times(52).times(100).toNumber();
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
