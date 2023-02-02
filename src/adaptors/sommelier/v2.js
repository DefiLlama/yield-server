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

// Use the change in avg daily price between the last 2 days to calculate an APR
// If there isn't at least 48 hours of hour data then we shold set the pool property
// `apyBaseInception` to the backtested APY
async function getApy(cellarAddress) {
  // Returns hourData in desc order, current hour is index 0
  const hrData = await queries.getHourData(cellarAddress, windowInHrs);

  // Need a minimum of 2 days of data to calculate yield
  if (hrData.length < 48) {
    return 0;
  }

  // Sum hourly price of the last 2 days individually
  let sumPrice = new BigNumber(0);
  let sumPrevPrice = new BigNumber(0);
  for (let i = 0; i < 24; i++) {
    // Current 24hrs
    sumPrice = sumPrice.plus(hrData[i].shareValue);

    // Previous 24hrs
    sumPrevPrice = sumPrevPrice.plus(hrData[i + 24].shareValue);
  }

  const price = sumPrice.div(24);
  const prevPrice = sumPrevPrice.div(24);
  const yieldRatio = price.minus(prevPrice).div(prevPrice);

  return yieldRatio.times(365).times(100).toNumber();
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
