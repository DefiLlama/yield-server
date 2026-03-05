const utils = require('../utils');

const MIN_TVL_USD = 10000
const TON_ADDRESS = "EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c"

function extractPoolSymbol(tokens) {
  const parts = []

  for (let asset of tokens) {
    parts.push(asset["address"]["address"] === "native" ? "TON" : asset["metadata"]["symbol"])
  }

  return parts.join("-")
}

function normalizeAddress(address) {
  return address === "native" ? TON_ADDRESS : address
}

const poolsFunction = async () => {
  let allPools = []

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

  // No reason to load pools with TVL < 10k USD.
  // DefiLlama only displays pools with >10k TVL,
  // so pools with less TVL than that will appear on the adapter but not on defillama
  allPools = allPools.filter((pool) => pool["pool_statistics"]["tvl_usd"] >= MIN_TVL_USD)

  let poolRewards = {}
  for (let pool of allPools) {
    const statisticsBoostApr = pool["pool_statistics"]["boost_apr"]
    if (statisticsBoostApr === 0) {
      continue
    }
    const address = pool["address"]

    const detailed = await utils.getData(`https://backend.swap.coffee/v1/yield/pool/${address}`)
    const boosts = detailed["pool"]["boosts"]

    const rewards = []
    let boostAprSum = 0
    for (let boost of boosts) {
      rewards.push(normalizeAddress(boost["reward_token"]["address"]["address"]))
      boostAprSum += boost["apr"]
    }
    if (boostAprSum < statisticsBoostApr && !rewards.includes(TON_ADDRESS)) {
      rewards.push(TON_ADDRESS)
    }
    poolRewards[address] = rewards
  }

  return allPools.map((pool) => {
    const poolAddress = pool["address"]
    const statistics = pool["pool_statistics"]
    const tokens = pool["tokens"]
    const boostApr = statistics["boost_apr"]

    return {
      pool: `${pool["address"]}-ton`.toLowerCase(),
      chain: "TON",
      project: "swap.coffee",
      symbol: extractPoolSymbol(tokens),
      tvlUsd: statistics["tvl_usd"],
      apyBase: statistics["lp_apr"],
      apyReward: boostApr > 0 ? boostApr : undefined,
      rewardTokens: boostApr > 0 ? poolRewards[poolAddress] : undefined,
      underlyingTokens: tokens.map((token) => normalizeAddress(token["address"]["address"])),
      poolMeta: `AMM: ${pool["pool"]["amm_type"]}`,
      url: `https://swap.coffee/earn/pool/${poolAddress}`
    };
  })
}

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://swap.coffee/earn',
};