const utils = require('../utils');
const abi = require('./abi.js');
const sdk = require('@defillama/sdk');

const pools = [
  {
    pool: "0x243681B8Cd79E3823fF574e07B2378B8Ab292c1E",
    project: "deri-protocol",
    chain: "bsc",
    chainId: "56",
    btoken: "BUSD",
  },
  {
    pool: "0xDE3447Eb47EcDf9B5F90E7A6960a14663916CeE8",
    project: "deri-protocol",
    chain: "arbitrum",
    chainId: "42161",
    btoken: "USDC",
  }
]
const poolsFunction = async () => {
  let apyData = pools.map(async (item) => {
    let url = `https://api.deri.io/pool_mining_info/${item.chainId}/${item.pool}`
    let res = await utils.getData(url)
    let data = []
    let obj = res.data.bTokens.map((token) => {
      if (token.bTokenSymbol === item.btoken) {
        let apy = Number(token.apy) + Number(token.supplyApy) + Number(token.xvsApy)
        data.push({
          pool: item.pool,
          chain: item.chain,
          project: item.project,
          apyBase: apy * 100,
          symbol: token.bTokenSymbol,
        })
      }
    })
    return data
  })
  apyData = await Promise.all(apyData)

  let Pool = []
  for (let index = 0; index < apyData.length; index++) {
    let obj = apyData[index].map(async (apyItem) => {
      let tvl = await sdk.api.abi.call({
        target: apyItem.pool,
        abi: abi.find((m) => m.name === 'liquidity'),
        chain: apyItem.chain
      })
      let pool = `${apyItem.pool}-${apyItem.chain}`
      let poolObj = {
        "pool": pool.toLowerCase(),
        "chain": utils.formatChain(apyItem.chain),
        "project": apyItem.project,
        "tvlUsd": Number(tvl.output) / 10 ** 18,
        "symbol": apyItem.symbol,
        "apyBase": apyItem.apyBase
      }
      return poolObj
    })
    let tvl = await Promise.all(obj)
    Pool.push(tvl[0])
  }
  return Pool
}
module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://deri.io',
};