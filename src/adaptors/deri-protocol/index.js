const utils = require('../utils');

const pools = [
  {
    pool: "0x243681B8Cd79E3823fF574e07B2378B8Ab292c1E",
    project: "deri-protocol",
    chain: utils.formatChain('bsc'),
    chainId: "56"
  },
  {
    pool: "0xDE3447Eb47EcDf9B5F90E7A6960a14663916CeE8",
    project: "deri-protocol",
    chain: utils.formatChain('arbitrum'),
    chainId: "42161"
  }
]
const poolsFunction = async () => {
  let apyData = pools.map(async (item) => {
    let url = `https://api.deri.io/pool_mining_info/${item.chainId}/${item.pool}`
    let res = await utils.getData(url)
    let data = []
    console.log("apyData",res)
    let obj = res.data.bTokens.map((token) => {
      if (token.bTokenSymbol === item.btoken) {
        let apy = Number(token.apy) + Number(token.supplyApy) + Number(token.xvsApy)
        data.push({
          pool: item.pool,
          chain: item.chain,
          project: item.project,
          apy: apy * 100,
          symbol: token.bTokenSymbol
        })
      }
    })
    return data
  })
  apyData = await Promise.all(apyData)
  let tvlData = pools.map(async (item) => {
    let url = `https://infoapi.deri.io/get_tokens?pool=${item.pool}`
    let res = await utils.getData(url)
    let data = []
    let obj = res.data.btokens.map((token) => {
      if (token.name === item.btoken) {
        data.push({
          pool: item.pool,
          chain: item.chain,
          project: item.project,
          tvlUsd: token.value,
          symbol: token.name
        })
      }
    })
    return data
  })
  tvlData = await Promise.all(tvlData)
  let Pool = []
  for (let index = 0; index < apyData.length; index++) {
    apyData[index].map((apyItem) => {
      let tvlObj = tvlData.map((tvlItem) => {
        let obj = tvlItem.find(tvlItems => tvlItems.pool === apyItem.pool && tvlItems.symbol === apyItem.symbol)
        if (obj && obj.tvlUsd !== "NaN") {
          let pool = `${apyItem.pool}-${apyItem.chain}`
          let poolObj = {
            "pool": pool.toLowerCase(),
            "chain": apyItem.chain,
            "project": apyItem.project,
            "tvlUsd": Number(obj.tvlUsd),
            "symbol": apyItem.symbol,
            "apy": apyItem.apy
          }
          Pool.push(poolObj)
        }
      })
    })
  }
  console.log(Pool)
  return Pool

}
module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://deri.io',
};