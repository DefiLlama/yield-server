const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const cellarAbi = require('./cellar-v2.json');
const { endOfYesterday, subDays } = require('date-fns');
const utils = require('../utils');

const call = sdk.api.abi.call;

const abiDecimals = cellarAbi.find((el) => el.name === 'decimals');
const abiConvertToAssets = cellarAbi.find(
  (el) => el.name === 'convertToAssets'
);

const getPositionAssets = cellarAbi.find(
  (el) => el.name === 'getPositionAssets'
);

async function getBlockByEpoch(epochSecs, cellarChain) {
  if (!Number.isInteger) {
    throw new Error('getBlockByEpoch was not passed an integer');
  }

  const data = await utils.getData(
    `https://coins.llama.fi/block/${cellarChain}/${epochSecs}`
  );

  return data.height;
}

async function getShareValueAtBlock(cellarAddress, block, cellarChain) {
  const decimals = (
    await call({
      target: cellarAddress,
      abi: abiDecimals,
      chain: cellarChain,
    })
  ).output;

  const share = new BigNumber(10).pow(decimals);

  const shareValue = (
    await call({
      target: cellarAddress,
      abi: abiConvertToAssets,
      params: [share.toString()],
      block,
      chain: cellarChain,
    })
  ).output;

  return new BigNumber(shareValue);
}

async function calcApy(
  cellarAddress,
  startEpochSecs,
  endEpochSecs,
  intervalDays,
  cellarChain
) {
  const startBlock = await getBlockByEpoch(startEpochSecs, cellarChain);
  const endBlock = await getBlockByEpoch(endEpochSecs, cellarChain);

  // APY 7 day may error out if share price oracle was not live for 7 days, so try catch here
  // Note we dont do this in the daily APY because that should always work if we're live
  // End Value should always work so only do this for start value

  let startValue;
  try {
    startValue = await getShareValueAtBlock(
      cellarAddress,
      startBlock,
      cellarChain
    );
  } catch (e) {
    console.error(
      'Unable to get start value for calcApy cellar: ',
      cellarAddress,
      'startBlock: ',
      startBlock,
      'intervalDays: ',
      intervalDays
    );
    return 0; // Return 0 for APY if we can't get start value
  }

  const endValue = await getShareValueAtBlock(
    cellarAddress,
    endBlock,
    cellarChain
  );

  const yieldRatio = endValue.minus(startValue).div(startValue);
  const result = yieldRatio
    .times(365 / intervalDays)
    .times(100)
    .toNumber();

  return Number.isNaN(result) ? 0 : result;
}

function utcToday() {
  const dateString = new Date().toISOString().split('T')[0];
  return new Date(`${dateString}T00:00:00.000Z`);
}

function utcEndOfYesterday() {
  const today = utcToday();
  return new Date(today.getTime() - 1000);
}

async function getApy(cellarAddress, cellarChain) {
  const yesterday = utcEndOfYesterday();
  const start = subDays(yesterday, 1);

  const yesterdayEpoch = Math.floor(yesterday.getTime() / 1000);
  const startEpoch = Math.floor(start.getTime() / 1000);

  return calcApy(cellarAddress, startEpoch, yesterdayEpoch, 1, cellarChain);
}

async function getApy7d(cellarAddress, cellarChain) {
  const interval = 7; // days
  const yesterday = utcEndOfYesterday();

  // Subtract 6 days because we are including yesterday
  const start = subDays(yesterday, interval - 1);

  const yesterdayEpoch = Math.floor(yesterday.getTime() / 1000);
  const startEpoch = Math.floor(start.getTime() / 1000);

  return calcApy(
    cellarAddress,
    startEpoch,
    yesterdayEpoch,
    interval,
    cellarChain
  );
}

module.exports = {
  getBlockByEpoch,
  getShareValueAtBlock,
  calcApy,
  getApy,
  getApy7d,
};
