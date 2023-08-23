const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const queries = require('./queries');
const cellarAbi = require('./cellar-v2.json');
const { chain, realYieldEth } = require('./config');
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
  getApy,
  getApy7d,
  getHoldingPosition,
  getUnderlyingTokens,
};
