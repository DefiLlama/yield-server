const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const queries = require('./queries');
const cellarAbi = require('./cellar-v2.json');
const { chain, realYieldEth } = require('./config');
const { endOfYesterday, subDays } = require('date-fns');
const utils = require('../utils');

const call = sdk.api.abi.call;

const abiAsset = cellarAbi.find((el) => el.name === 'asset');
const abiDecimals = cellarAbi.find((el) => el.name === 'decimals');
const abiConverToAssets = cellarAbi.find((el) => el.name === 'convertToAssets');

const getPositionAssets = cellarAbi.find(
  (el) => el.name === 'getPositionAssets'
);

const windowInHrs = 48; // 2 days
const dayInSec = 60 * 60 * 24; // 1 day in seconds

async function getBlockByEpoch(epochSecs) {
  if (!Number.isInteger) {
    throw new Error('getBlockByEpoch was not passed an integer');
  }

  const data = await utils.getData(
    `https://coins.llama.fi/block/ethereum/${epochSecs}`
  );

  return data.height;
}

async function getShareValueAtBlock(cellarAddress, block) {
  const decimals = (
    await call({
      target: cellarAddress,
      abi: abiDecimals,
      chain,
    })
  ).output;

  const share = new BigNumber(10).pow(decimals);

  const shareValue = (
    await call({
      target: cellarAddress,
      abi: abiConverToAssets,
      params: [share.toString()],
      block,
      chain,
    })
  ).output;

  return new BigNumber(shareValue);
}

async function calcApy(cellarAddress, startEpochSecs, endEpochSecs) {
  const startBlock = await getBlockByEpoch(startEpochSecs);
  const endBlock = await getBlockByEpoch(endEpochSecs);

  const startValue = await getShareValueAtBlock(cellarAddress, startBlock);
  const endValue = await getShareValueAtBlock(cellarAddress, endBlock);

  const yieldRatio = endValue.minus(startValue).div(startValue);
  const result = yieldRatio.times(365).times(100).toNumber();

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

async function getApy(cellarAddress) {
  const yesterday = utcEndOfYesterday();
  const start = subDays(yesterday, 1);

  const yesterdayEpoch = Math.floor(yesterday.getTime() / 1000);
  const startEpoch = Math.floor(start.getTime() / 1000);

  return calcApy(cellarAddress, startEpoch, yesterdayEpoch);
}

async function getApy7d(cellarAddress) {
  const yesterday = utcEndOfYesterday();
  const start = subDays(yesterday, 7);

  const yesterdayEpoch = Math.floor(yesterday.getTime() / 1000);
  const startEpoch = Math.floor(start.getTime() / 1000);

  return calcApy(cellarAddress, startEpoch, yesterdayEpoch);
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
  getBlockByEpoch,
  getShareValueAtBlock,
};
