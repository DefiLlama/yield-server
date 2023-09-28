const sdk = require('@defillama/sdk');
const abi = require('./abi.json');

const convertToAssets = async (strategy, position, block = 'latest') => {
  const data = (
    await sdk.api.abi.call({
      target: strategy,
      abi: abi.find((m) => m.name === 'convertToAssets'),
      params: [position.toString()],
      chain: 'ethereum',
      block: block,
    })
  ).output;

  return data;
};

const totalAssets = async (strategy, block = 'latest') => {
  const data = (
    await sdk.api.abi.call({
      target: strategy,
      abi: abi.find((m) => m.name === 'totalAssets'),
      chain: 'ethereum',
      block,
    })
  ).output;

  return data;
};

module.exports = {
  convertToAssets,
  totalAssets,
};
