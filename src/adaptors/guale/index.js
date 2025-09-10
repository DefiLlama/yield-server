/* GUALE – yield-server adapter (Arbitrum)
 * - Reads underlying tokens via wants()
 * - Reads total amounts via balances() (vault + strategy/positions)
 * - Gets USD prices from Llama prices API
 * - Returns pools[] with tvlUsd and metadata
 *
 * Note: APY is set to 0 for now (no pricePerShare exposed by vaults).
 */

const sdk = require('@defillama/sdk')
const utils = require('../utils')

const CHAIN = 'arbitrum'
const PROJECT = 'guale'

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

module.exports = {
  timetravel: false,
  url: 'https://app.guale.co/',
  apy: async () => {
    // 1) on-chain reads: wants() & balances() for each vault
    const [wantsOut, balsOut] = await Promise.all([
      sdk.api.abi
        .multiCall({
          abi: abi.wants,
          chain: CHAIN,
          calls: VAULTS.map((a) => ({ target: a })),
        })
        .then((r) => r.output.map((x) => x.output)),
      sdk.api.abi
        .multiCall({
          abi: abi.balances,
          chain: CHAIN,
          calls: VAULTS.map((a) => ({ target: a })),
        })
        .then((r) => r.output.map((x) => x.output)),
    ])

    // Normalize outputs
    const tokenPairs = wantsOut.map((w) =>
      Array.isArray(w)
        ? [w[0].toLowerCase(), w[1].toLowerCase()]
        : [w.token0.toLowerCase(), w.token1.toLowerCase()]
    )
    const amountPairs = balsOut.map((b) =>
      Array.isArray(b) ? [b[0], b[1]] : [b.amount0, b.amount1]
    )

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

    const decimals = Object.fromEntries(
      decOut.output.map((x, i) => [uniqTokens[i], Number(x.output)])
    )
    const symbols = Object.fromEntries(
      symOut.output.map((x, i) => [uniqTokens[i], String(x.output || '')])
    )

    // 3) Prices: coins.llama.fi/prices/current/<chain:token,chain:token,...>
    const priceIds = uniqTokens.map((t) => `${CHAIN}:${t}`).join(',')
    const priceResp = await utils.getData(
      `https://coins.llama.fi/prices/current/${priceIds}`
    )
    const prices = priceResp?.coins || {}

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
      const tvlUsd = tvl0 + tvl1

      const sym0 = symbols[t0] || 'T0'
      const sym1 = symbols[t1] || 'T1'

      return {
        pool: poolId(vault),
        chain: 'Arbitrum',
        project: PROJECT,
        symbol: `${sym0}-${sym1}`,
        tvlUsd,
        apy: 0, // No PPS exposed; set to 0 for now
        underlyingTokens: [t0, t1],
        rewardTokens: [],
        url: 'https://app.guale.co/',
      }
    })

    return pools
  },
}
