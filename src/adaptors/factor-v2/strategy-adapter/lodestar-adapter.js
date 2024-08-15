const sdk = require('@defillama/sdk');
const utils = require('../../utils');
const { makeReadable } = require('./utils');

async function getSupplyRatePerBlock(assetAddress) {
  const { output } = await sdk.api.abi.call({
    target: assetAddress,
    abi: 'uint256:supplyRatePerBlock',
    chain: 'arbitrum',
  });
  return {
    supplyRatePerBlock: makeReadable(output),
  };
}

async function getLodestarApr(assetAddress) {
  const { supplyRatePerBlock } = await getSupplyRatePerBlock(assetAddress);
  const blocksPerYear = 7200 * 365;
  const apr = (1 + supplyRatePerBlock) ** blocksPerYear - 1;
  return apr * 100;
}

async function getExchangeRateStored(assetAddress) {
  const { output } = await sdk.api.abi.call({
    target: assetAddress,
    abi: 'uint256:exchangeRateStored',
    chain: 'arbitrum',
  });
  return {
    exchangeRateStored: makeReadable(output, 16),
  };
}

async function getLodestarUnderlyingTokenPriceInUSD(lToken) {
  const { output: underlyingTokenAddress } = await sdk.api.abi.call({
    target: lToken,
    abi: 'address:underlying',
    chain: 'arbitrum',
  });
  const underlyingLodestarTokenPriceInUSD = (
    await utils.getPrices([underlyingTokenAddress], 'arbitrum')
  ).pricesByAddress[underlyingTokenAddress.toLowerCase()];

  return { underlyingLodestarTokenPriceInUSD };
}

async function getLodestarTokenPriceInUSD(lToken) {
  const [{ exchangeRateStored }, { underlyingLodestarTokenPriceInUSD }] =
    await Promise.all([
      getExchangeRateStored(lToken),
      getLodestarUnderlyingTokenPriceInUSD(lToken),
    ]);

  const lTokenPriceInUSD =
    underlyingLodestarTokenPriceInUSD * exchangeRateStored;
  return lTokenPriceInUSD;
}

module.exports = { getLodestarApr, getLodestarTokenPriceInUSD };
