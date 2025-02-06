const { getProvider } = require('@defillama/sdk/build/general');
const { ethers, Contract, BigNumber } = require('ethers');
const pairsSugarContractAbi = require("./abis/veloPairsSugarV2.json");
const { concat } = require('lodash');

const veloPairAddress = {
  optimism: '0xD11Aa38D87C6604A127431D4d3aa8C0e9763f0be',
  base: '0x51f290CCCD6a54Af00b38edDd59212dE068B8A4b'
}
const ADDRESS_ZERO = "0x0000000000000000000000000000000000000000"

const rpcUrlMap = {
  optimism: 'https://optimism.llamarpc.com',
  base: 'https://base.llamarpc.com',
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
    veloPairContract.all(300, 0),
    veloPairContract.all(300, 300),
    veloPairContract.all(300, 600),
  ])
  const poolInfoList = concat(...poolInfoLists)
  return poolInfoList
}
