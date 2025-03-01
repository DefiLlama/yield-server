const sdk = require('@defillama/sdk');
const { ControllerAbi, ERC20Abi } = require('./abi');

const getAsset = async (strategy, pairId, block = 'latest') => {
  const data = (
    await sdk.api.abi.call({
      target: strategy,
      abi: ControllerAbi.find((m) => m.name === 'getAsset'),
      params: [pairId],
      chain: 'arbitrum',
      block: block,
    })
  ).output;

  return data;
};

const getTotalSupply = async (strategyToken, block = 'latest') => {
  const data = (
    await sdk.api.abi.call({
      target: strategyToken,
      abi: ERC20Abi.find((m) => m.name === 'totalSupply'),
      params: [],
      chain: 'arbitrum',
      block: block,
    })
  ).output;

  return data;
};

module.exports = {
  getAsset,
  getTotalSupply,
};
