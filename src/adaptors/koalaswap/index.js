const { request, gql } = require('graphql-request')
const utils = require('../utils')

const chain = 'unit0'
const config = {
  uiBase: 'https://koalaswap.app',
  subgraph: 'https://graph-unit-zero.umerge.org/subgraphs/name/koalaswap-v3-unit-zero/',
}

const POOLS_QUERY = gql`
  query GetPools($first: Int!, $skip: Int!) {
    pools(first: $first, skip: $skip, orderBy: totalValueLockedUSD, orderDirection: desc) {
      id
      token0 { id symbol }
      token1 { id symbol }
      totalValueLockedUSD
      volumeUSD
      feesUSD
      feeTier
    }
  }
`

async function getAllPoolsFromGraph() {
  const pageSize = 100
  let skip = 0
  let results = []

  while (true) {
    const data = await request(config.subgraph, POOLS_QUERY, { first: pageSize, skip })
    if (!data.pools || data.pools.length === 0) break
    results = results.concat(data.pools)
    skip += pageSize
  }
  return results
}

async function getPools() {
  const pools = await getAllPoolsFromGraph()

  const dataPools = pools.map((p) => {
    const tvlUsd = Number(p.totalValueLockedUSD || 0)
    const volumeUsd1d = Number(p.volumeUSD || 0)
    const feesUsd1d = Number(p.feesUSD || 0)

    const apr = tvlUsd > 0 ? (feesUsd1d / tvlUsd) * 365 : 0
    const apyBase = apr * 100

    return {
      pool: p.id,
      chain,
      project: 'koalaswap',
      symbol: `${p.token0.symbol}-${p.token1.symbol}`,
      poolMeta: `${Number(p.feeTier) / 1e4}%`,
      tvlUsd,
      apyBase,
      underlyingTokens: [p.token0.id, p.token1.id],
      url: `${config.uiBase}/pools/${p.id}`,
      volumeUsd1d,
    }
  })

  return dataPools.filter((p) => utils.keepFinite(p))
}

async function main() {
  const data = await getPools()
  return data
}

module.exports = {
  timetravel: false,
  apy: main,
}
