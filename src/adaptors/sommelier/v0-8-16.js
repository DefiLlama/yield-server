const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const cellarAbi = require('./cellar-v0-8-16.json');
const { chain } = require('./config');
const { getApy } = require('./apy');

const call = sdk.api.abi.call;

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
