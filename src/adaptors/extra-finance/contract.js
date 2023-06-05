const { getProvider } = require('@defillama/sdk/build/general');
const { ethers, Contract, BigNumber } = require('ethers');
const pairsSugarContractAbi = require("./abis/veloPairsSugar.json");

const veloPairAddress = '0x75c31cC1a815802336aa3bd3F7cACA896Afc7630'
const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000"

const rpcUrl = 'https://opt-mainnet.g.alchemy.com/v2/oEk9gsFsYITNlTL4guXm5BmhcRZ24NfA'
const simpleRpcProvider = new ethers.providers.JsonRpcProvider(rpcUrl);

exports.getVeloPoolInfo = async function (poolAddress, chain) {
  const veloPairContract = new Contract(veloPairAddress, pairsSugarContractAbi, simpleRpcProvider)
  const poolInfo = await veloPairContract.byAddress(poolAddress, ADDRESS_ZERO)
  return poolInfo
}
