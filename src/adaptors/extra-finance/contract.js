const { getProvider } = require('@defillama/sdk/build/general');
const { ethers, Contract, BigNumber } = require('ethers');
const pairsSugarContractAbi = require("./abis/veloPairsSugarV2.json");

const veloPairAddress = '0x3b21531Bd00289f10C7D8B64b9389095f521A4d3'
const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000"

const rpcUrl = 'https://opt-mainnet.g.alchemy.com/v2/oEk9gsFsYITNlTL4guXm5BmhcRZ24NfA'
const simpleRpcProvider = new ethers.providers.JsonRpcProvider(rpcUrl);

exports.getVeloPoolInfo = async function (poolAddress, chain) {
  const veloPairContract = new Contract(veloPairAddress, pairsSugarContractAbi, simpleRpcProvider)
  const poolInfo = await veloPairContract.byAddress(poolAddress, ADDRESS_ZERO)
  return poolInfo
}

exports.getAllVeloPools = async function () {
  const veloPairContract = new Contract(veloPairAddress, pairsSugarContractAbi, simpleRpcProvider)
  const res = await veloPairContract.all(10000, 0, ADDRESS_ZERO)
  return res
}
