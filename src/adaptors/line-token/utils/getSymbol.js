const sdk = require('@defillama/sdk');

const { CHAIN } = require('../config');

module.exports = async function getSymbol(target) {
  return (
    await sdk.api.abi.call({
      target,
      abi: 'erc20:symbol',
      chain: CHAIN,
    })
  ).output;
};
