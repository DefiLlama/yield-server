/*
 * src/adaptors/guale/index.js
 *
 * Yield-server adapter for Guale (Arbitrum)
 * - Reads underlying tokens via wants()
 * - Reads total balances via balances() (vault + strategy/positions)
 * - Fetches token prices from DefiLlama prices API
 * - Returns an array of pools with tvlUsd and metadata
 * - APY is set to 0 for now (no pricePerShare or fee data exposed)
 */

'use strict'

const sdk = require('@defillama/sdk')
const utils = require('../utils')

const CHAIN = 'arbitrum'
const PROJECT = 'guale'
const APP_URL = 'https://app.guale.co/'

// Live CLM vaults on Arbitrum
const VAULTS = [
  '0x6a84f7ba493c4d6590696b782b0f0fb2588fbdc2',
  '0xea89fd775cc0203b79a5cb5710d66a6145ea391d',
  '0x6077e51a48a1ee3f8fa975dc23041cf248b180c7',
].map((a) => a.toLowerCase())

const abi = {
  // Returns the addresses of the two underlying tokens (token0, token1)
  wants: 'function wants() view returns (address token0, address token1)',
  // Returns the total balances of those tokens (amount0, amount1) across the system (vault + strategy/positions)
  balances: 'function balances() view returns (uint256 amount0, uint256 amount1)',
  // Standard ERC20
  decimals: 'function decimals() view returns (uint8)',
  symbol: 'function symbol() view returns (string)',
}

const poolId = (addr) => `${addr.toLowerCase()}-${CHAIN}`
const toLower = (v) => (typeof v === 'string' ? v.toLowerCase() : v)

/**
 * Safe unwrap for multiCall outputs that may be arrays or named objects.
 * @param {any} w wants() output
 * @returns {[string, string]} [token0, token1]
 */
function unwrapWants(w) {
  if (Array.isArray(w)) return [toLower(w[0]), toLower(w[1])]
  return [toLower(w.token0), toLower(w.token1)]
}

/**
 * Safe unwrap for balances() outputs.
 * @param {any} b balances() output
 * @returns {[string|number, string|number]} [amount0, amount1]
 */
function unwrapBalances(b) {
  if (Array.isArray(b)) return [b[0], b[1]]
  return [b.amount0, b.amount1]
}

/**
 * Fetch current USD prices for a set of tokens on a given chain.
 * Returns an object keyed by `${CHAIN}:${address}`.
 */
async function fetchPrices(chain, tokenAddresses) {
  if (!tokenAddresses.length) return {}
  const ids = tokenAddresses.map((t) => `${chain}:${t}`).join(',')
  try {
    const resp = await utils.getData(`https://coins.llama.fi/prices/current/${ids}`)
    return resp?.coins || {}
  } catch (_) {
    // Fail soft – return empty so TVL falls back to 0 for missing prices
    return {}
  }
}

/**
 * Main adapter entry: returns pools[] with TVL and metadata.
 */
async function apy() {
  if (!VAULTS.length) return []

  // 1) Read wants() and balances() for all vaults
  const [wantsOut, balsOut] = await Promise.all([
    sdk.api.abi
      .multiCall({ abi: abi.wants, chain: CHAIN, calls: VAULTS.map((a) => ({ target: a })) })
      .then((r) => r.output.map((x) => x.output)),
    sdk.api.abi
      .multiCall({ abi: abi.balances, chain: CHAIN, calls: VAULTS.map((a) => ({ target: a })) })
      .then((r) => r.output.map((x) => x.output)),
  ])

  const tokenPairs = wantsOut.map(unwrapWants)
  const amountPairs = balsOut.map(unwrapBalances)

  // 2) Fetch decimals & symbols for unique tokens
  const uniqTokens = [...new Set(tokenPairs.flat())]

  const [decOut, symOut] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: abi.decimals,
      chain: CHAIN,
      calls: uniqTokens.map((t) => ({ target: t })),
    }),
    sdk.api.abi.multiCall({
      abi: abi.symbol,
      chain: CHAIN,
      calls: uniqTokens.map((t) => ({ target: t })),
    }),
  ])

  const decimals = Object.fromEntries(decOut.output.map((x, i) => [uniqTokens[i], Number(x.output)]))
  const symbols = Object.fromEntries(symOut.output.map((x, i) => [uniqTokens[i], String(x.output || '')]))

  // 3) Prices
  const prices = await fetchPrices(CHAIN, uniqTokens)

  // 4) Build pools[]
  const pools = VAULTS.map((vault, i) => {
    const [t0, t1] = tokenPairs[i]
    const [a0, a1] = amountPairs[i]

    const d0 = decimals[t0] ?? 18
    const d1 = decimals[t1] ?? 18

    const p0 = prices[`${CHAIN}:${t0}`]?.price ?? 0
    const p1 = prices[`${CHAIN}:${t1}`]?.price ?? 0

    const tvl0 = (Number(a0) / 10 ** d0) * p0
    const tvl1 = (Number(a1) / 10 ** d1) * p1
    const tvlUsdRaw = tvl0 + tvl1

    // Round to 2 decimals to avoid noisy floats
    const tvlUsd = Number.isFinite(tvlUsdRaw) ? Math.round(tvlUsdRaw * 100) / 100 : 0

    const sym0 = symbols[t0] || 'T0'
    const sym1 = symbols[t1] || 'T1'

    return {
      pool: poolId(vault),
      chain: 'Arbitrum',
      project: PROJECT,
      symbol: `${sym0}-${sym1}`,
      tvlUsd,
      apy: 0, // No PPS/fee metric yet
      underlyingTokens: [t0, t1],
      rewardTokens: [],
      url: APP_URL,
    }
  })

  return pools
}

module.exports = {
  timetravel: false,
  apy,
  url: APP_URL,
}
