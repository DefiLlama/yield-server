const { getProvider } = require('@defillama/sdk/build/general');
const { ethers, Contract, BigNumber } = require('ethers');
const pairsSugarContractAbi = require("./abis/veloPairsSugarV2.json");
const { concat } = require('lodash');

const veloPairAddress = {
  optimism: '0xF6F6955756Db870258C31B49cB51860b77b53194',
  base: '0xC301856B4262E49E9239ec8a2d0c754d5ae317c0'
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
