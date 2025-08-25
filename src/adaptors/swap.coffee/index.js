const utils = require('../utils');

function extractPoolSymbol(tokens) {
  const parts = []

  for (let asset of tokens) {
    parts.push(asset["address"]["address"] === "native" ? "TON" : asset["metadata"]["symbol"])
  }

  return parts.join("-")
}

function normalizeAddress(address) {
  return address === "native" ? "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c" : address
}

const poolsFunction = async () => {
  const allPools = []

  for (let trusted of ["true", "false"]) {
    let size = 0
    for (let page = 1; ;page++) {
      const response = (await utils.getData(`https://backend.swap.coffee/v1/yield/pools?blockchains=ton&providers=coffee&trusted=${trusted}&size=100&page=${page}`))[0]
      const pools = response["pools"]
      if (pools.length === 0) {
        break
      }

      allPools.push(...pools)
      size += pools.length
      if (size >= response["total_count"]) {
        break
      }
    }
  }

  return allPools.map((pool) => {
    const statistics = pool["pool_statistics"]
    const tokens = pool["tokens"]

    return {
      pool: `${pool["address"]}-ton`.toLowerCase(),
      chain: "TON",
      project: "swap.coffee",
      symbol: extractPoolSymbol(tokens),
      tvlUsd: statistics["tvl_usd"],
      apy: statistics["apr"],
      underlyingTokens: tokens.map((token) => normalizeAddress(token["address"]["address"])),
      poolMeta: `AMM: ${pool["pool"]["amm_type"]}`,
      url: `https://swap.coffee/earn/pool/${pool["address"]}`
    };
  })
}

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://swap.coffee/earn',
};