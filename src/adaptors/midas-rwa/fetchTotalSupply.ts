const sdk = require('@defillama/sdk');
const erc20Abi = require('./abi/erc20Abi.json');
const contractAddresses = require('./addresses');

const fetchTotalSupply = async (chain, token) => {
  const address = contractAddresses[chain][token].address;
  const abiMethod = erc20Abi.find((m) => m.name === 'totalSupply');

  const result = await sdk.api.abi.call({
    abi: abiMethod,
    target: address,
    chain,
  });

  return BigInt(result.output);
};

module.exports = fetchTotalSupply;
