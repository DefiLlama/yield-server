const sdk = require('@defillama/sdk');

const { CHAIN } = require('../config');

module.exports = async function getDecimals(target) {
  return (
    await sdk.api.abi.call({
      target,
      abi: 'erc20:decimals',
      chain: CHAIN,
    })
  ).output;
};
