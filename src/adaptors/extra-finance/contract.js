const { getProvider } = require('@defillama/sdk/build/general');
const { ethers, Contract, BigNumber } = require('ethers');
const pairsSugarContractAbi = require("./abis/veloPairsSugarV2.json");

const veloPairAddress = {
  optimism: '0x3b21531Bd00289f10C7D8B64b9389095f521A4d3',
  base: '0x2073D8035bB2b0F2e85aAF5a8732C6f397F9ff9b'
}
const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000"

const rpcUrlMap = {
  optimism: 'https://opt-mainnet.g.alchemy.com/v2/oEk9gsFsYITNlTL4guXm5BmhcRZ24NfA',
  base: 'https://base-mainnet.g.alchemy.com/v2/4uTkolRkEpkMx7Egth0pzjJAd9IbYsJc'
}

exports.getVeloPoolInfo = async function (poolAddress, chain) {
  const rpcUrl = rpcUrlMap[chain]
  const simpleRpcProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const veloPairContract = new Contract(veloPairAddress[chain], pairsSugarContractAbi, simpleRpcProvider)
  const poolInfo = await veloPairContract.byAddress(poolAddress, ADDRESS_ZERO)
  return poolInfo
}

exports.getAllVeloPools = async function (chain) {
  const rpcUrl = rpcUrlMap[chain]
  const simpleRpcProvider = new ethers.providers.JsonRpcProvider(rpcUrl);
  const veloPairContract = new Contract(veloPairAddress[chain], pairsSugarContractAbi, simpleRpcProvider)
  const res = await veloPairContract.all(10000, 0, ADDRESS_ZERO)
  return res
}
