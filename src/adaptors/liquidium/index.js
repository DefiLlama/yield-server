const utils = require('../utils')

const LENDING_CANISTER_ID = 'hyk4r-jqaaa-aaaar-qb4ca-cai'
const BTC_POOL_CANISTER_ID = 'hkmli-faaaa-aaaar-qb4ba-cai'
const ERC_POOL_CANISTER_ID = 'hnnn4-iyaaa-aaaar-qb4bq-cai'
const ALLOWED_POOL_CANISTERS = new Set([
  BTC_POOL_CANISTER_ID,
  ERC_POOL_CANISTER_ID,
])
const ICP_HOST = 'https://icp-api.io'
const CALL_TIMEOUT_MS = 30_000
const RAY = 10n ** 27n
const MAX_SAFE_BIGINT = BigInt(Number.MAX_SAFE_INTEGER)

const ASSET_META = {
  BTC: { decimals: 8 },
  SOL: { decimals: 9 },
  USDC: { decimals: 6 },
  USDT: { decimals: 6 },
}

const STABLES = new Set(['USDC', 'USDT'])
const CHAIN_MAP = {
  BTC: 'Bitcoin',
  ETH: 'Ethereum',
  SOL: 'Solana',
}

const idlFactory = ({ IDL }) => {
  const Assets = IDL.Variant({
    BTC: IDL.Null,
    SOL: IDL.Null,
    USDC: IDL.Null,
    USDT: IDL.Null,
  })
  const Chains = IDL.Variant({
    BTC: IDL.Null,
    ETH: IDL.Null,
    SOL: IDL.Null,
  })
  const AssetType = IDL.Variant({
    CkAsset: IDL.Principal,
    Unknown: IDL.Null,
  })
  const Pool = IDL.Record({
    optimal_utilization_rate: IDL.Nat,
    principal: IDL.Principal,
    total_generated_interest_snapshot: IDL.Nat,
    asset_type: AssetType,
    supply_cap: IDL.Opt(IDL.Nat),
    same_asset_borrowing: IDL.Opt(IDL.Bool),
    asset: Assets,
    rate_slope_before: IDL.Nat,
    borrow_cap: IDL.Opt(IDL.Nat),
    total_debt_at_last_sync: IDL.Nat,
    supply_at_last_sync: IDL.Nat,
    chain: Chains,
    rate_slope_after: IDL.Nat,
    reserve_factor: IDL.Nat64,
    last_updated: IDL.Opt(IDL.Nat64),
    lending_index: IDL.Nat,
    protocol_liquidation_fee: IDL.Nat64,
    treasury_supply_scaled: IDL.Nat,
    same_asset_borrowing_dust_threshold: IDL.Nat,
    borrow_index: IDL.Nat,
    base_rate: IDL.Nat,
    frozen: IDL.Bool,
    liquidation_bonus: IDL.Nat64,
    liquidation_threshold: IDL.Nat64,
    max_ltv: IDL.Nat64,
    repay_grace_period: IDL.Opt(IDL.Nat64),
    pending_service_fees: IDL.Nat,
    total_supply_at_last_sync: IDL.Nat,
  })
  return IDL.Service({
    list_pools: IDL.Func([], [IDL.Vec(Pool)], ['query']),
    get_prices: IDL.Func(
      [],
      [IDL.Vec(IDL.Tuple(IDL.Text, IDL.Nat, IDL.Nat32))],
      ['query']
    ),
  })
}

const getVariantKey = (variant) => Object.keys(variant)[0]

function toBigInt(value, field = 'value') {
  if (value === null || value === undefined) return 0n
  if (typeof value === 'bigint') return value
  if (typeof value === 'number') return BigInt(Math.trunc(value))
  if (typeof value === 'string') return BigInt(value)
  if (typeof value.toString === 'function') return BigInt(value.toString())
  throw new Error(`Unable to convert ${field} to bigint`)
}

function toSafeInteger(value, field = 'value') {
  if (value === null || value === undefined) return 0
  if (typeof value === 'number') {
    if (!Number.isInteger(value)) {
      throw new Error(`${field} is not an integer`)
    }
    return value
  }

  const parsed = toBigInt(value, field)
  if (parsed > MAX_SAFE_BIGINT || parsed < -MAX_SAFE_BIGINT) {
    throw new Error(`${field} exceeds Number.MAX_SAFE_INTEGER`)
  }
  return Number(parsed)
}

function fixedPointToNumber(value, decimals, field = 'value') {
  const parsed = toBigInt(value, field)
  const decimalPlaces = BigInt(toSafeInteger(decimals, `${field} decimals`))
  if (decimalPlaces < 0n) throw new Error(`${field} decimals cannot be negative`)

  const negative = parsed < 0n
  const abs = negative ? -parsed : parsed
  const scale = 10n ** decimalPlaces
  const integerPart = abs / scale
  const fractionalPart = abs % scale

  if (integerPart > MAX_SAFE_BIGINT) {
    throw new Error(`${field} exceeds Number.MAX_SAFE_INTEGER after scaling`)
  }

  const integerValue = Number(integerPart)
  if (fractionalPart === 0n) return negative ? -integerValue : integerValue

  const decimalsInt = Number(decimalPlaces)
  const fractionText = fractionalPart
    .toString()
    .padStart(decimalsInt, '0')
    .replace(/0+$/, '')
  const fractionValue = Number(`0.${fractionText}`)
  const result = integerValue + fractionValue
  return negative ? -result : result
}

function withTimeout(promise, label) {
  let timeoutId
  const timeoutPromise = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(
        new Error(`Liquidium canister timeout for ${label} after ${CALL_TIMEOUT_MS}ms`)
      )
    }, CALL_TIMEOUT_MS)
  })

  return Promise.race([promise, timeoutPromise]).finally(() => clearTimeout(timeoutId))
}

function clampRay(value) {
  if (value < 0n) return 0n
  if (value > RAY) return RAY
  return value
}

function calculateBorrowRateRay(pool, utilizationRay) {
  const baseRate = toBigInt(pool.base_rate, 'base_rate')
  const slopeBefore = toBigInt(pool.rate_slope_before, 'rate_slope_before')
  const slopeAfter = toBigInt(pool.rate_slope_after, 'rate_slope_after')
  const optimalUtilization = toBigInt(
    pool.optimal_utilization_rate,
    'optimal_utilization_rate'
  )

  if (optimalUtilization <= 0n) return baseRate

  if (utilizationRay <= optimalUtilization) {
    return baseRate + (utilizationRay * slopeBefore) / optimalUtilization
  }

  if (optimalUtilization >= RAY) {
    return baseRate + slopeBefore
  }

  return (
    baseRate +
    slopeBefore +
    ((utilizationRay - optimalUtilization) * slopeAfter) / (RAY - optimalUtilization)
  )
}

function rayToPercent(value, field = 'rate') {
  return fixedPointToNumber(value, 27, field) * 100
}

function getUnderlyingToken(pool, fallbackToken) {
  const assetTypeKey = getVariantKey(pool.asset_type)
  if (assetTypeKey === 'CkAsset' && pool.asset_type.CkAsset) {
    return pool.asset_type.CkAsset.toString()
  }
  return fallbackToken
}

let sourcePromise
async function getSourceData() {
  if (sourcePromise) return sourcePromise

  sourcePromise = (async () => {
    const { HttpAgent, Actor } = await import('@dfinity/agent')
    const agent = new HttpAgent({ host: ICP_HOST })
    const actor = Actor.createActor(idlFactory, { agent, canisterId: LENDING_CANISTER_ID })
    const [pools, prices] = await Promise.all([
      withTimeout(actor.list_pools(), 'list_pools'),
      withTimeout(actor.get_prices(), 'get_prices'),
    ])

    return { pools, prices }
  })().catch((error) => {
    sourcePromise = null
    throw error
  })

  return sourcePromise
}

function buildPriceMap(prices) {
  const priceMap = { BTC: null, SOL: null, USDC: 1, USDT: 1 }
  for (const [pair, priceInt, decimals] of prices) {
    if (!pair.endsWith('_USDT')) continue
    const asset = pair.split('_')[0]

    try {
      const decimalsInt = toSafeInteger(decimals, `${pair} decimals`)
      if (decimalsInt < 0 || decimalsInt > 77) continue
      const parsedPrice = fixedPointToNumber(priceInt, decimalsInt, `${pair} price`)
      if (Number.isFinite(parsedPrice) && parsedPrice > 0) {
        priceMap[asset] = parsedPrice
      }
    } catch (_error) {
      continue
    }
  }
  return priceMap
}

const apy = async () => {
  const { pools, prices } = await getSourceData()
  const allowedPools = pools.filter((pool) =>
    ALLOWED_POOL_CANISTERS.has(pool.principal.toString()) && pool.frozen === false
  )

  const priceMap = buildPriceMap(prices)

  const data = allowedPools.map((pool) => {
    const asset = getVariantKey(pool.asset)
    const chainKey = getVariantKey(pool.chain)
    const chainName = CHAIN_MAP[chainKey] || chainKey
    const meta = ASSET_META[asset] || { decimals: 0 }
    const price = STABLES.has(asset) ? 1 : priceMap[asset]
    if (price === null || !Number.isFinite(price) || price <= 0) {
      return null
    }

    const totalSupplyRaw = toBigInt(pool.total_supply_at_last_sync, 'total_supply_at_last_sync')
    const totalBorrowRaw = toBigInt(pool.total_debt_at_last_sync, 'total_debt_at_last_sync')
    const totalSupply = fixedPointToNumber(
      totalSupplyRaw,
      meta.decimals,
      'total_supply_at_last_sync'
    )
    const totalBorrow = fixedPointToNumber(
      totalBorrowRaw,
      meta.decimals,
      'total_debt_at_last_sync'
    )

    const utilizationRay =
      totalSupplyRaw > 0n ? clampRay((totalBorrowRaw * RAY) / totalSupplyRaw) : 0n
    const borrowRateRay = calculateBorrowRateRay(pool, utilizationRay)
    const reserveFactor = clampRay(
      (toBigInt(pool.reserve_factor, 'reserve_factor') * RAY) / 10_000n
    )
    const supplyRateRay =
      (((borrowRateRay * utilizationRay) / RAY) * (RAY - reserveFactor)) / RAY

    const apyBaseBorrow = rayToPercent(borrowRateRay, 'borrow_rate')
    const apyBase = rayToPercent(supplyRateRay, 'supply_rate')

    const totalSupplyUsd = totalSupply * price
    const totalBorrowUsd = totalBorrow * price
    const tvlUsd = totalSupplyUsd - totalBorrowUsd
    const ltv = toSafeInteger(pool.max_ltv, 'max_ltv') / 10000

    const poolId = `${pool.principal.toString()}-${asset}`
    const underlyingToken = getUnderlyingToken(pool, asset)

    return {
      pool: poolId,
      chain: utils.formatChain(chainName),
      project: 'liquidium',
      symbol: asset,
      tvlUsd,
      apyBase,
      apyReward: 0,
      apyBaseBorrow,
      underlyingTokens: [underlyingToken],
      totalSupplyUsd,
      totalBorrowUsd,
      ltv: Number.isFinite(ltv) ? ltv : null,
      borrowable: true,
    }
  })

  return data.filter((p) => p && utils.keepFinite(p))
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://liquidium.fi/',
}
