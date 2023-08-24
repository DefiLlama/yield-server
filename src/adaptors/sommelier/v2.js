const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const queries = require('./queries');
const cellarAbi = require('./cellar-v2.json');
const { chain } = require('./config');
const utils = require('../utils');
const { getApy, getApy7d } = require('./apy');

const call = sdk.api.abi.call;

const abiAsset = cellarAbi.find((el) => el.name === 'asset');
const getPositionAssets = cellarAbi.find(
  (el) => el.name === 'getPositionAssets'
);

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
  getApy7d,
  getHoldingPosition,
  getUnderlyingTokens,
};
