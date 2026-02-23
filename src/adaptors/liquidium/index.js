const utils = require('../utils')

const LENDING_CANISTER_ID = 'hyk4r-jqaaa-aaaar-qb4ca-cai'
const BTC_POOL_CANISTER_ID = 'hkmli-faaaa-aaaar-qb4ba-cai'
const ERC_POOL_CANISTER_ID = 'hnnn4-iyaaa-aaaar-qb4bq-cai'
const ALLOWED_POOL_CANISTERS = new Set([
  BTC_POOL_CANISTER_ID,
  ERC_POOL_CANISTER_ID,
])
const ICP_HOST = 'https://icp-api.io'

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
const toNumber = (value) => Number(value ?? 0)

let sourcePromise
async function getSourceData() {
  if (sourcePromise) return sourcePromise

  sourcePromise = (async () => {
    const { HttpAgent, Actor } = await import('@dfinity/agent')
    const agent = new HttpAgent({ host: ICP_HOST })
    const actor = Actor.createActor(idlFactory, { agent, canisterId: LENDING_CANISTER_ID })
    const [pools, prices] = await Promise.all([
      actor.list_pools(),
      actor.get_prices(),
    ])

    return { pools, prices }
  })().catch((error) => {
    sourcePromise = null
    throw error
  })

  return sourcePromise
}

function buildPriceMap(prices) {
  const priceMap = { BTC: 0, SOL: 0, USDC: 1, USDT: 1 }
  for (const [pair, priceInt, decimals] of prices) {
    if (!pair.endsWith('_USDT')) continue
    const asset = pair.split('_')[0]
    priceMap[asset] = toNumber(priceInt) / 10 ** toNumber(decimals)
  }
  return priceMap
}

const apy = async () => {
  const { pools, prices } = await getSourceData()
  const allowedPools = pools.filter((pool) =>
    ALLOWED_POOL_CANISTERS.has(pool.principal.toString())
  )

  const priceMap = buildPriceMap(prices)

  const data = allowedPools.map((pool) => {
    const asset = getVariantKey(pool.asset)
    const chainKey = getVariantKey(pool.chain)
    const chainName = CHAIN_MAP[chainKey] || chainKey
    const meta = ASSET_META[asset] || { decimals: 0 }
    const divisor = 10 ** meta.decimals
    const price = STABLES.has(asset) ? 1 : priceMap[asset] ?? 0

    const totalSupplyUsd = (toNumber(pool.total_supply_at_last_sync) / divisor) * price
    const totalBorrowUsd = (toNumber(pool.total_debt_at_last_sync) / divisor) * price
    const tvlUsd = totalSupplyUsd - totalBorrowUsd
    const ltv = Number(pool.max_ltv) / 10000

    const poolId = `${pool.principal.toString()}-${asset}`

    return {
      pool: poolId,
      chain: utils.formatChain(chainName),
      project: 'liquidium',
      symbol: asset,
      tvlUsd,
      apyBase: 0,
      apyReward: 0,
      underlyingTokens: [asset],
      totalSupplyUsd,
      totalBorrowUsd,
      ltv: Number.isFinite(ltv) ? ltv : null,
      borrowable: true,
    }
  })

  return data.filter((p) => utils.keepFinite(p))
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://liquidium.fi/',
}
