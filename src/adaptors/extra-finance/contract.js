const { getProvider } = require('@defillama/sdk/build/general');
const { ethers, Contract, BigNumber } = require('ethers');
const pairsSugarContractAbi = require("./abis/veloPairsSugarV2.json");
const { concat } = require('lodash');

const veloPairAddress = {
  optimism: '0x1381B1E6aaFa01bD28e95AdaB35bdA8191826bC8',
  base: '0x82357A700f242476da8C5712C010B2D5e327C588'
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
  const poolInfoLists = await Promise.all([
    veloPairContract.all(400, 0),
    veloPairContract.all(400, 400),
    veloPairContract.all(400, 800),
  ])
  const poolInfoList = concat(...poolInfoLists)
  return poolInfoList
}
