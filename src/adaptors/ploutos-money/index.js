// Ploutos money market (Aave v3 fork) — base yield adapter
// - uses ProtocolDataProvider to read reserves/rates
// - outputs apyBase / apyBaseBorrow as APY (compounded from APR ray)
// - project slug: 'ploutos-money'

const axios = require('axios')
const sdk = require('@defillama/sdk')
const utils = require('../utils')
const poolAbi = require('./poolAbi') // must contain getAllReservesTokens, getAllATokens, getReserveData, getReserveConfigurationData

// --- map of your ProtocolDataProvider per market key (sdk chain key)
const protocolDataProviders = {
  base:    '0x7dcb86dC49543E14A98F80597696fe5f444f58bC',
  arbitrum:'0x0F65a7fBCb69074cF8BE8De1E01Ef573da34bD59',
  polygon: '0x6A9b632010226F9bBbf2B6cb8B6990bE3F90cb0e',
  katana:  '0x4DC446e349bDA9516033E11D63f1851d6B5Fd492',
  plasma:  '0x9C48A6D3e859ab124A8873D73b2678354D0B4c0A',
  hemi:    '0x0F65a7fBCb69074cF8BE8De1E01Ef573da34bD59',
}

// pretty chain name for output (must match api.llama.fi/chains)
const CHAIN_NAME = {
  base: 'Base',
  arbitrum: 'Arbitrum',
  polygon: 'Polygon',
  katana: 'Katana',
  plasma: 'Plasma',
  hemi: 'Hemi',
}

// marketName mapping for your app URL
function toMarketUrlParam(market) {
  if (market === 'ethereum') return 'mainnet'
  if (market === 'avax') return 'avalanche'
  if (market === 'xdai') return 'gnosis'
  if (market === 'bsc') return 'bnb'
  return market
}

const RAY = 1e27
const WAD = 1e18
const SECONDS_PER_YEAR = 31_536_000

// APR ray (per year) -> APR (decimal)
const aprRayToDecimal = (ray) => Number(ray) / RAY

// Convert APR (decimal) to APY (decimal), daily comp
const aprToApyDecimal = (apr) => Math.pow(1 + apr / 365, 365) - 1

async function getApy(market) {
  const chain = market // sdk chain key for onchain calls
  const chainOut = CHAIN_NAME[market] ?? market // pretty name for Llama output

  const protocolDataProvider = protocolDataProviders[market]
  if (!protocolDataProvider) return []

  // reserves & aTokens
  const reserveTokens = (await sdk.api.abi.call({
    target: protocolDataProvider,
    abi: poolAbi.find((m) => m.name === 'getAllReservesTokens'),
    chain,
  })).output

  const aTokens = (await sdk.api.abi.call({
    target: protocolDataProvider,
    abi: poolAbi.find((m) => m.name === 'getAllATokens'),
    chain,
  })).output

  // core reserve data
  const poolsReserveData = (await sdk.api.abi.multiCall({
    calls: reserveTokens.map((p) => ({ target: protocolDataProvider, params: p.tokenAddress })),
    abi: poolAbi.find((m) => m.name === 'getReserveData'),
    chain,
  })).output.map((o) => o.output)

  const poolsReservesConfigurationData = (await sdk.api.abi.multiCall({
    calls: reserveTokens.map((p) => ({ target: protocolDataProvider, params: p.tokenAddress })),
    abi: poolAbi.find((m) => m.name === 'getReserveConfigurationData'),
    chain,
  })).output.map((o) => o.output)

  // supplies/balances
  const aTokenTotalSupply = (await sdk.api.abi.multiCall({
    chain,
    abi: 'erc20:totalSupply',
    calls: aTokens.map((t) => ({ target: t.tokenAddress })),
  })).output.map((o) => o.output)

  // underlying balances held by aToken (actual TVL)
  const underlyingBalances = (await sdk.api.abi.multiCall({
    chain,
    abi: 'erc20:balanceOf',
    calls: aTokens.map((t, i) => ({
      target: reserveTokens[i].tokenAddress,
      params: [t.tokenAddress],
    })),
  })).output.map((o) => o.output)

  // decimals: for aToken totals & for underlying balances (note: different tokens!)
  const aTokenDecimals = (await sdk.api.abi.multiCall({
    chain,
    abi: 'erc20:decimals',
    calls: aTokens.map((t) => ({ target: t.tokenAddress })),
  })).output.map((o) => o.output)

  const underlyingDecimals = (await sdk.api.abi.multiCall({
    chain,
    abi: 'erc20:decimals',
    calls: reserveTokens.map((p) => ({ target: p.tokenAddress })),
  })).output.map((o) => o.output)

  // prices
  const priceKeys = reserveTokens.map((t) => `${chain}:${t.tokenAddress}`).join(',')
  const pricesResp = await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)
  const prices = pricesResp.data?.coins || {}

  // build pools
  const pools = reserveTokens.map((pool, i) => {
    const cfg = poolsReservesConfigurationData[i]
    const p = poolsReserveData[i]
    const frozen = cfg.isFrozen
    if (frozen) return null

    // skip GHO or sGHO if present in reserves (step 1 requirement)
    const sym = (pool.symbol || '').toUpperCase()
    if (sym === 'GHO' || sym === 'SGHO' || sym === 'STKGHO') return null

    const price = prices[`${chain}:${pool.tokenAddress}`]?.price
    if (!price) return null

    // totalSupplyUsd computed via aToken supply (scaled by aToken decimals) * underlying price
    const supplyAToken = Number(aTokenTotalSupply[i]) / 10 ** Number(aTokenDecimals[i])
    const totalSupplyUsd = supplyAToken * price

    // tvlUsd = actual underlying balance held by aToken (scaled by underlying decimals) * price
    const currentUnderlying = Number(underlyingBalances[i]) / 10 ** Number(underlyingDecimals[i])
    const tvlUsd = currentUnderlying * price

    // totalBorrowUsd = supply - tvl (standard for Aave markets)
    const totalBorrowUsd = Math.max(totalSupplyUsd - tvlUsd, 0)

    // rates: APR (decimal) from ray -> APY (decimal)
    const supplyApr = aprRayToDecimal(p.liquidityRate)
    const borrowApr = aprRayToDecimal(p.variableBorrowRate)
    const apyBase = aprToApyDecimal(supplyApr) * 100
    const apyBaseBorrow = aprToApyDecimal(borrowApr) * 100

    const marketUrlParam = toMarketUrlParam(market)
    const url = `https://app.ploutos.money/reserve-overview/?underlyingAsset=${pool.tokenAddress.toLowerCase()}&marketName=proto_${marketUrlParam}_v3`

    return {
      pool: `${aTokens[i].tokenAddress}-${(market === 'avax' ? 'avalanche' : market)}`.toLowerCase(),
      chain: chainOut,
      project: 'ploutos-money',
      symbol: pool.symbol,
      tvlUsd,
      apyBase,
      apyBaseBorrow,
      underlyingTokens: [pool.tokenAddress],
      totalSupplyUsd,
      totalBorrowUsd,
      ltv: cfg.ltv / 10000,
      borrowable: cfg.borrowingEnabled,
      url,
      // no mintedCoin, no apyReward yet (Merkl step 2)
    }
  }).filter(Boolean)

  return pools
}

async function apy() {
  const markets = Object.keys(protocolDataProviders)
  const results = await Promise.allSettled(markets.map((m) => getApy(m)))
  return results
    .filter((r) => r.status === 'fulfilled')
    .flatMap((r) => r.value)
    .filter((p) => utils.keepFinite(p))
}

module.exports = {
  timetravel: false,
  apy,
}