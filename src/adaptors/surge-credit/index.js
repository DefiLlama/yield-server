const sdk = require('@defillama/sdk')
const utils = require('../utils')

// Surge Credit, USDC lending yield on Base (chainId 8453).
// One pool entry per on-chain market:
//   Market 0: variable (adaptive, Morpho-style)
//   Market 1: fixed rate, funded by market-0 lenders' opt-in exposure
// DeFiLlama protocol slug: surge-credit (id 8328). The adaptor folder name, the
// pool `project` field, and the protocol slug must all match.

const CHAIN = 'base'
const LIQUIDITY_POOL = '0xEE755F1BbcbF6e3260469D0f473522d71d3bdDda'
const USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'

const abi = {
  marketCount: 'function marketCount() view returns (uint256)',
  getMarketBorrowRate: 'function getMarketBorrowRate(uint256) view returns (uint256)',
  getUtilization: 'function getUtilization(uint256) view returns (uint256)',
  markets:
    'function markets(uint256) view returns (address provider, address token, bool active, uint256 totalSupplyShares, uint256 totalSupplyAssets, uint256 totalPhysicalSupply, uint256 totalBorrowShares, uint256 totalBorrowAssets, uint256 totalPhysicalBorrow, uint256 supplyExchangeRate, uint256 borrowExchangeRate, uint256 protocolEarnings, uint256 protocolEarningsAvailable, uint256 originationFeeBps, uint256 reserveRateBps, uint256 maxLtvBps, uint256 liquidationThresholdBps, uint256 lastAccrueTime, uint256 protocolSupplyShares)',
}

// The pool accrues interest via continuous compounding (ExpMath.wCompoundFactor),
// so annualize a per-annum rate (bps) as APY = e^r - 1.
const aprBpsToApy = (bps) => (Math.exp(bps / 1e4) - 1) * 100

async function apy() {
  const api = new sdk.ChainApi({ chain: CHAIN })
  const count = Number(await api.call({ target: LIQUIDITY_POOL, abi: abi.marketCount }))

  const pools = []
  for (let m = 0; m < count; m++) {
    try {
      const market = await api.call({ target: LIQUIDITY_POOL, abi: abi.markets, params: [m] })
      if (!market.active) continue

      const borrowRateBps = Number(
        await api.call({ target: LIQUIDITY_POOL, abi: abi.getMarketBorrowRate, params: [m] })
      )
      const utilBps = Number(
        await api.call({ target: LIQUIDITY_POOL, abi: abi.getUtilization, params: [m] })
      )

      // Lender APR (bps) = borrowRate * utilization * (1 - reserveRate).
      // reserveRateBps is read live per market (2000 = 20% on both today, not the
      // 11%/14% in stale docs); it moves supply APY directly.
      const reserveBps = Number(market.reserveRateBps)
      const supplyAprBps = (borrowRateBps * utilBps * (1e4 - reserveBps)) / (1e4 * 1e4)

      const totalSupplyUsd = Number(market.totalSupplyAssets) / 1e6
      const totalBorrowUsd = Number(market.totalBorrowAssets) / 1e6

      // tvlUsd = idle (available) USDC liquidity = supplied - borrowed, per DeFiLlama's
      // lending convention. Each market reports its OWN idle: the two markets' supplied
      // figures are a disjoint partition of the same lender base (capital allocated to a
      // fixed loan moves out of market 0's supply and into market 1's), so no dollar is
      // double-counted. The fixed market is funded on demand from variable-market lenders'
      // opt-in exposure and runs at 100% utilization by construction, so it holds no idle
      // liquidity of its own: 0. (Previously this used getMaxBorrowAmount, which returns
      // the SHARED market-0 idle for both markets and therefore counted it twice.)
      const isFixed = m !== 0
      const idleUsd = isFixed ? 0 : Math.max(0, totalSupplyUsd - totalBorrowUsd)

      pools.push({
        // Unique per market: liquidity-pool address + market id + chain.
        pool: `${LIQUIDITY_POOL.toLowerCase()}-${m}-${CHAIN}`,
        chain: utils.formatChain(CHAIN),
        project: 'surge-credit',
        symbol: 'USDC',
        tvlUsd: idleUsd,
        apyBase: aprBpsToApy(supplyAprBps), // supply APY, continuously compounded
        apyReward: null,
        apyBaseBorrow: aprBpsToApy(borrowRateBps), // borrow APY, same compounding as supply
        totalSupplyUsd,
        totalBorrowUsd,
        availableBorrowUsd: idleUsd,
        ltv: Number(market.maxLtvBps) / 1e4,
        borrowable: true,
        underlyingTokens: [USDC],
        poolMeta: isFixed ? 'Fixed Market' : 'Variable Market',
        url: `https://earn.surge.credit/#/market/${m}`,
      })
    } catch {
      // Skip a market that fails to read rather than dropping the whole adapter.
      continue
    }
  }
  return pools
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://earn.surge.credit/#/markets',
  // DeFiLlama protocol id for surge-credit (defillama.com/protocol/surge-credit).
  protocolId: '8328',
}
