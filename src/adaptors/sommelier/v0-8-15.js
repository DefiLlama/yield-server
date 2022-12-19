const { default: BigNumber } = require('bignumber.js');
const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const queries = require('./queries');
const cellarAbi = require('./cellar-v0-8-15.json');
const { chain } = require('./config');

const call = sdk.api.abi.call;

async function getApy(cellarAddress) {
  const dayData = await queries.getDayData(cellarAddress, 30);

  // Find the most recent accural event (the date shareValue changed)
  // Use the yield / loss to extrapolate APR
  const idx = dayData.findIndex((el, idx, arr) => {
    if (idx === dayData.length - 1) return false;

    const price = el.shareValue;
    const prevPrice = arr[idx + 1].shareValue;

    return prevPrice !== price;
  });

  if (idx < 0) return 0;

  const price = new BigNumber(dayData[idx].shareValue);
  const prevPrice = new BigNumber(dayData[idx + 1].shareValue);
  const yieldRatio = price.minus(prevPrice).div(prevPrice);

  return yieldRatio.times(52).times(100).toNumber();
}

async function getUnderlyingTokens(cellarAddress) {
  const asset = (
    await call({
      target: cellarAddress,
      abi: cellarAbi.asset,
      chain,
    })
  ).output;

  return [asset];
}

async function getTvlUsd(cellarAddress, assetAddress) {
  // Total balance of asset held by the Cellar
  const totalAssets = (
    await call({
      target: cellarAddress,
      abi: cellarAbi.totalAssets,
      chain,
    })
  ).output;

  // Used to convert decimals
  const decimals = (
    await call({
      target: assetAddress,
      abi: 'erc20:decimals',
      chain,
    })
  ).output;

  const prices = (await utils.getPrices([assetAddress], chain)).pricesByAddress;
  const price = prices[assetAddress.toLowerCase()];

  const total = new BigNumber(totalAssets);

  // balance * usd price converted from asset decimals
  return total
    .times(price)
    .div(10 ** decimals)
    .toNumber();
}

module.exports = {
  getApy,
  getUnderlyingTokens,
  getTvlUsd,
};
