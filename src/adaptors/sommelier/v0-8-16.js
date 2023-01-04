const { default: BigNumber } = require('bignumber.js');
const { request, gql } = require('graphql-request');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const queries = require('./queries');
const cellarAbi = require('./cellar-v0-8-16.json');
const { chain } = require('./config');

const call = sdk.api.abi.call;

// Use the change in price over 30 days to extrapolate an APR
async function getApy(cellarAddress) {
  const dayData = await queries.getDayData(cellarAddress, 30);

  const price = new BigNumber(dayData[0].shareValue);
  const prevPrice = new BigNumber(dayData[dayData.length - 1].shareValue);
  const yieldRatio = price.minus(prevPrice).div(prevPrice);

  return yieldRatio.times(12).times(100).toNumber();
}

// Call getPositions() to get a list of assets held by the Cellar
async function getUnderlyingTokens(cellarAddress) {
  const assets = (
    await call({
      target: cellarAddress,
      abi: cellarAbi.getPositions,
      chain,
    })
  ).output;

  return assets;
}

async function getHoldingPosition(cellarAddress) {
  const asset = (
    await call({
      target: cellarAddress,
      abi: cellarAbi.holdingPosition,
      chain,
    })
  ).output;

  return asset;
}

async function getTvlUsd(cellarAddress, assetAddress) {
  // Represents the value of the Cellar's postitions denominated in the holding asset
  const totalAssets = (
    await call({
      target: cellarAddress,
      abi: cellarAbi.totalAssets,
      chain,
    })
  ).output;

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

  // value of cellar in holding position* usd price converted from asset decimals
  return total
    .times(price)
    .div(10 ** decimals)
    .toNumber();
}

module.exports = {
  getApy,
  getHoldingPosition,
  getUnderlyingTokens,
  getTvlUsd,
};
