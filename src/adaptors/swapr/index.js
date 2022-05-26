const utils = require('../utils')
const { request, gql } = require('graphql-request')

//CONSTANTS
const PROJECT_NAME = "swapr"

const ARBITRUM_ENDPOINT = "https://api.thegraph.com/subgraphs/name/dxgraphs/swapr-arbitrum-one-v3"

const XDAI_ENDPOINT = "https://api.thegraph.com/subgraphs/name/dxgraphs/swapr-xdai-v2"

const QUERY_PAIRS = gql`
  {
    pairs(first: 1000 orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id
      volumeUSD
      reserve0
      reserve1
      token0 {
        id
        symbol
      }
      token1 {
        id
        symbol
      }
    }
  }
`

const QUERY_PRIOR = gql`
  {
    pairs(first: 1000 orderDirection: desc block: {number: <PLACEHOLDER>}) {
      id 
      volumeUSD 
    }
  }
`

const createPool = (entry, chainString) => {
  const { id, token0, token1, totalValueLockedUSD: tvlUsd, apy } = entry

  let symbol = utils.formatSymbol(
    `${token0.symbol}-${token1.symbol}`
  );

  const chain = utils.formatChain(chainString)

  return {
    pool: id,
    chain,
    project: PROJECT_NAME,
    symbol,
    tvlUsd,
    apy,
  }
}

const topLvl = async (chainString, url, query, queryPrior, timestamp) => {
  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [
    url,
  ])

  let dataNow = await request(url, query.replace('<PLACEHOLDER>', block))

  // pull 24h offset data to calculate fees from swap volume
  const dataPrior = await request(
    url,
    queryPrior.replace('<PLACEHOLDER>', blockPrior)
  )

  // calculate tvl
  dataNow = await utils.tvl(dataNow.pairs, chainString)

  // calculate apy
  const data = dataNow.map(pair => utils.apy(pair, dataPrior.pairs, 'v2'))

  return data.map(pair => createPool(pair, chainString))
}

const main = async (timestamp = null) => {
  const data = await Promise.all([
    topLvl('arbitrum', ARBITRUM_ENDPOINT, QUERY_PAIRS, QUERY_PRIOR, timestamp),
    topLvl('xdai', XDAI_ENDPOINT, QUERY_PAIRS, QUERY_PRIOR, timestamp)
  ]);

  return data.flat().filter(pool => !isNaN(pool.apy))
}

module.exports = {
  timetravel: true,
  apy: main,
}