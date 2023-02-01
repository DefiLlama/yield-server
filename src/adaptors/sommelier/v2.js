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

const dayInSecs = 60 * 60 * 24;
const windowInDays = 7;

// Use the change in price over 7 days to calculate an APR
// If the cellar has been live for less than 7 days use the
// number of days since launch.
async function getApy(cellarAddress, launchEpoch) {
  // Returns dayData in desc order, today is index 0
  const dayData = await queries.getDayData(cellarAddress, windowInDays);

  // Need a minimum of 2 days to calculate yield
  if (dayData.length < 2) {
    return 0;
  }

  let numDays = dayData.length;
  let previousDayIdx = numDays - 1;

  const windowDaysAfterLaunch = dayInSecs * windowInDays + launchEpoch;

  // We are less than a week since launch, calculate APR using
  // days since launch as the window
  if (numDays < windowInDays || dayData[0].date < windowDaysAfterLaunch) {
    const launchDayIdx = dayData.findIndex((data) => data.date === launchEpoch);

    if (launchDayIdx === -1) {
      // Noop, leaving a comment to describe behavior
      // We should have found the launch day data, but the epoch must have been configured incorrectly
      // in src/adaptors/sommelier/config.js. Use window based on number of day datas returned by subgraph.
    } else {
      // We found the launch day data. Determine how many days have elapsed.
      numDays = launchDayIdx + 1;
      previousDayIdx = launchDayIdx;
    }
  }

  const windowsInYear = 365 / numDays; // Normally ~52 unless we are less than a week since launch
  const price = new BigNumber(dayData[0].shareValue); // Now price
  const prevPrice = new BigNumber(dayData[previousDayIdx].shareValue); // Comparison price
  const yieldRatio = price.minus(prevPrice).div(prevPrice);

  return yieldRatio.times(windowsInYear).times(100).toNumber();
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
  getApy,
  getHoldingPosition,
  getUnderlyingTokens,
};
