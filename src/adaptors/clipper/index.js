const { request } = require('graphql-request');
const utils = require('../utils');
const { queryDailyPoolStatus } = require('./queries')

const ChainId = {
  ETHEREUM: 1,
  POLYGON: 137,
  OPTIMISM: 10,
}

const ChainNameById = {
  [ChainId.ETHEREUM]: 'ethereum',
  [ChainId.POLYGON]: 'polygon',
  [ChainId.OPTIMISM]: 'optimism',
}

/** 
  * APY calculation will user the pool status for the last N days.
  * (e.g: If value set to 7, it takes the latest seven-day fee yield from the subgraph)
*/ 
const FEE_YIELD_LAST_DAYS = 7

const DAYS_IN_YEAR = 365

/**  APIs url constants  */
const CLIPPER_API = "https://api.clipper.exchange"
const POOL_STATUS_API = `${CLIPPER_API}/rfq/pool`
const SUBGRAPH_BASE_API = 'https://api.thegraph.com/subgraphs/name'
const SUBGRAPH_CHAIN_API = {
  [ChainId.ETHEREUM]: `${SUBGRAPH_BASE_API}/edoapp/clipper-mainnet`,
  [ChainId.POLYGON]: `${SUBGRAPH_BASE_API}/edoapp/clipper-polygon`,
  [ChainId.OPTIMISM]: `${SUBGRAPH_BASE_API}/edoapp/clipper-optimism`,
}
/** */

const getData = async (chainId) => {
  const [poolStatus, dailyPoolStatusesData] = await Promise.all([
    utils.getData(`${POOL_STATUS_API}?chain_id=${chainId}`),
    request(SUBGRAPH_CHAIN_API[chainId], queryDailyPoolStatus)
  ])

  return {
    dailyPoolStatuses: dailyPoolStatusesData.dailyPoolStatuses,
    poolStatus,
  }
}

const buildPoolInfo = (chainName, poolStatus, dailyPoolStatuses) => {
  const { value_in_usd, address } = poolStatus.pool
  const assetSymbols = poolStatus.assets.map((asset) => asset.name).join('-')
  const formattedSymbol = utils.formatSymbol(assetSymbols)
  
  const lastDaysPoolStatus = dailyPoolStatuses.slice(0, FEE_YIELD_LAST_DAYS)
  const lastDayAggStatus = lastDaysPoolStatus.reduce((prev, dailyPoolStatus) => {
    return {
      totalVolume: prev.totalVolume + +dailyPoolStatus.volumeUSD,
      totalFee: prev.totalFee + +dailyPoolStatus.feeUSD,
    }
  }, { totalVolume: 0, totalFee: 0 })
  const annualizedFee = lastDayAggStatus.totalFee * (DAYS_IN_YEAR / FEE_YIELD_LAST_DAYS)
  const apy = (annualizedFee * 100 ) / value_in_usd

  return {
    pool: address,
    chain: utils.formatChain(chainName),
    project: 'clipper',
    symbol: formattedSymbol,
    tvlUsd: value_in_usd,
    apy,
  }
}

const topLvl = async (chainId) => {
  const { dailyPoolStatuses, poolStatus } = await getData(chainId)
  const chainName = ChainNameById[chainId]

  return buildPoolInfo(chainName, poolStatus, dailyPoolStatuses)
}

const main = async () => {
  const data = await Promise.all([
    topLvl(ChainId.ETHEREUM),
    topLvl(ChainId.POLYGON),
    topLvl(ChainId.OPTIMISM),
  ]);

  return data;
};


module.exports = {
  timetravel: false,
  apy: main,
};
