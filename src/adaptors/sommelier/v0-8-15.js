const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const utils = require('../utils');
const cellarAbi = require('./cellar-v0-8-15.json');
const { getApy } = require('./apy');

const call = sdk.api.abi.call;

async function getUnderlyingTokens(cellarAddress, cellarChain) {
  const asset = (
    await call({
      target: cellarAddress,
      abi: cellarAbi.asset,
      chain: cellarChain,
    })
  ).output;

  return [asset];
}

async function getTvlUsd(cellarAddress, assetAddress, cellarChain) {
  // Total balance of asset held by the Cellar
  const totalAssets = (
    await call({
      target: cellarAddress,
      abi: cellarAbi.totalAssets,
      chain: cellarChain,
    })
  ).output;

  // Used to convert decimals
  const decimals = (
    await call({
      target: assetAddress,
      abi: 'erc20:decimals',
      chain: cellarChain,
    })
  ).output;

  const prices = (await utils.getPrices([assetAddress], cellarChain)).pricesByAddress;
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
