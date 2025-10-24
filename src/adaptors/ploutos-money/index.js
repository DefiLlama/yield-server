// Ploutos money market (Aave v3 fork) — yield adapter with Merkl integration via Map (clean, SES-safe)
// project: 'ploutos-money'

const axios = require('axios')
const sdk = require('@defillama/sdk')
const utils = require('../utils')
const poolAbi = require('./poolAbi')

// ---------- chain maps ----------
const protocolDataProviders = {
  base:    '0x7dcb86dC49543E14A98F80597696fe5f444f58bC',
  arbitrum:'0x0F65a7fBCb69074cF8BE8De1E01Ef573da34bD59',
  polygon: '0x6A9b632010226F9bBbf2B6cb8B6990bE3F90cb0e',
  katana:  '0x4DC446e349bDA9516033E11D63f1851d6B5Fd492',
  plasma:  '0x9C48A6D3e859ab124A8873D73b2678354D0B4c0A',
  hemi:    '0x0F65a7fBCb69074cF8BE8De1E01Ef573da34bD59',
}

const CHAIN_NAME = {
  base: 'Base',
  arbitrum: 'Arbitrum',
  polygon: 'Polygon',
  katana: 'Katana',
  plasma: 'Plasma',
  hemi: 'Hemi',
}

// chainIds (актуальные)
const CHAIN_ID = {
  base: 8453,
  arbitrum: 42161,
  polygon: 137,
  katana: 747474,
  plasma: 9745,
  hemi: 43111,
}

function toMarketUrlParam(market) {
  if (market === 'ethereum') return 'mainnet'
  if (market === 'avax') return 'avalanche'
  if (market === 'xdai') return 'gnosis'
  if (market === 'bsc') return 'bnb'
  return market
}

// ---------- math ----------
const RAY = 1e27
const aprRayToDecimal = (ray) => Number(ray) / RAY
const aprToApyDecimal = (apr) => Math.pow(1 + apr / 365, 365) - 1

// ---------- utils ----------
const WARN = (...a) => console.warn('[ploutos]', ...a)
const setToArray = (s) => Array.from(s ? s.values() : [])

// Вытягивает первое валидное 0x-адресное вхождение из «грязной» строки (SES-safe)
function extractAddrLoose(x) {
  if (x == null) return ''
  const s = String(x)
    .toLowerCase()
    .replace(/[\u200b-\u200d\uFEFF]/g, '') // удалить zero-width
    .trim()
  const m = s.match(/0x[0-9a-f]{40}/i)
  return m ? m[0] : ''
}
const normAddr = extractAddrLoose

// ---------- Merkl ----------
let merklCache = null

async function fetchMerkl() {
  if (merklCache) return merklCache
  try {
    const { data } = await axios.get('https://api.merkl.xyz/v4/opportunities', {
      params: { mainProtocolId: 'ploutos' },
      timeout: 15000,
    })
    merklCache = Array.isArray(data) ? data : (data ? [data] : [])
  } catch (e) {
    WARN('Merkl fetch failed:', e?.message || e)
    merklCache = []
  }
  return merklCache
}

/**
 * Индекс по ключу `${chainId}:${addressLower}`
 * Map<string, { supply:{apr:number,rewardTokens:string[]}, borrow:{apr:number,rewardTokens:string[]} }>
 * SES-safe: без спредов/for..of по Set
 */
async function buildMerklIndex() {
  const items = await fetchMerkl()
  const index = new Map()

  for (let idx = 0; idx < items.length; idx++) {
    const it = items[idx]
    const chainId = Number(it.chainId || 0)
    if (!chainId) continue

    const side = String(it.type || '').toUpperCase().includes('BORROW') ? 'borrow' : 'supply'
    const apr = Number(it.apr || 0)

    // reward tokens
    const rewardSet = new Set()
    const br = (it.rewardsRecord && it.rewardsRecord.breakdowns) || []
    for (let j = 0; j < br.length; j++) {
      const addr = normAddr(br[j]?.token?.address)
      if (addr) rewardSet.add(addr)
    }
    const rewardTokens = setToArray(rewardSet)

    // keys
    const keysRaw = new Set()
    const k1 = normAddr(it.identifier)
    const k2 = normAddr(it.explorerAddress)
    if (k1) keysRaw.add(k1)
    if (k2) keysRaw.add(k2)

    const toks = Array.isArray(it.tokens) ? it.tokens : []
    for (let k = 0; k < toks.length; k++) {
      const a = normAddr(typeof toks[k] === 'string' ? toks[k] : toks[k]?.address)
      if (a) keysRaw.add(a)
    }

    const keysArr = setToArray(keysRaw).map(a => `${chainId}:${a}`)
    for (let qi = 0; qi < keysArr.length; qi++) {
      const key = keysArr[qi]
      const cur = index.get(key) || {
        supply: { apr: 0, rewardTokens: [] },
        borrow: { apr: 0, rewardTokens: [] },
      }
      cur[side].apr += apr
      const curSet = new Set(cur[side].rewardTokens)
      for (let rtIdx = 0; rtIdx < rewardTokens.length; rtIdx++) curSet.add(rewardTokens[rtIdx])
      cur[side].rewardTokens = setToArray(curSet)
      index.set(key, cur)
    }
  }

  return index
}

// ---------- core adapter ----------
async function getApy(market) {
  const chain = market
  const chainOut = CHAIN_NAME[market] ?? market
  const provider = protocolDataProviders[market]
  const chainId = CHAIN_ID[market] || 0
  if (!provider) return []

  const reserves = (await sdk.api.abi.call({
    target: provider,
    abi: poolAbi.find(m => m.name === 'getAllReservesTokens'),
    chain,
  })).output

  const aTokens = (await sdk.api.abi.call({
    target: provider,
    abi: poolAbi.find(m => m.name === 'getAllATokens'),
    chain,
  })).output

  const reserveData = (await sdk.api.abi.multiCall({
    chain,
    abi: poolAbi.find(m => m.name === 'getReserveData'),
    calls: reserves.map(p => ({ target: provider, params: p.tokenAddress })),
  })).output.map(o => o.output)

  const reserveCfg = (await sdk.api.abi.multiCall({
    chain,
    abi: poolAbi.find(m => m.name === 'getReserveConfigurationData'),
    calls: reserves.map(p => ({ target: provider, params: p.tokenAddress })),
  })).output.map(o => o.output)

  const aSupplies = (await sdk.api.abi.multiCall({
    chain,
    abi: 'erc20:totalSupply',
    calls: aTokens.map(t => ({ target: t.tokenAddress })),
  })).output.map(o => o.output)

  const underlyingBalances = (await sdk.api.abi.multiCall({
    chain,
    abi: 'erc20:balanceOf',
    calls: aTokens.map((t, i) => ({
      target: reserves[i].tokenAddress,
      params: [t.tokenAddress],
    })),
  })).output.map(o => o.output)

  const aDecs = (await sdk.api.abi.multiCall({
    chain,
    abi: 'erc20:decimals',
    calls: aTokens.map(t => ({ target: t.tokenAddress })),
  })).output.map(o => o.output)

  const uDecs = (await sdk.api.abi.multiCall({
    chain,
    abi: 'erc20:decimals',
    calls: reserves.map(p => ({ target: p.tokenAddress })),
  })).output.map(o => o.output)

  const priceKeys = reserves.map(t => `${chain}:${t.tokenAddress}`).join(',')
  const prices = (await axios.get(`https://coins.llama.fi/prices/current/${priceKeys}`)).data?.coins || {}

  // Merkl map
  const merklMap = await buildMerklIndex()

  const out = []
  for (let i = 0; i < reserves.length; i++) {
    const r = reserves[i]
    const cfg = reserveCfg[i]
    if (cfg.isFrozen) continue

    const symUp = String(r.symbol || '').toUpperCase()
    if (symUp === 'GHO' || symUp === 'SGHO' || symUp === 'STKGHO') continue

    const price = prices[`${chain}:${r.tokenAddress}`]?.price
    if (!price) continue

    const supplyAToken = Number(aSupplies[i]) / 10 ** Number(aDecs[i])
    const totalSupplyUsd = supplyAToken * price

    const underlying = Number(underlyingBalances[i]) / 10 ** Number(uDecs[i])
    const tvlUsd = underlying * price

    const totalBorrowUsd = Math.max(totalSupplyUsd - tvlUsd, 0)

    const data = reserveData[i]
    const apyBase = aprToApyDecimal(aprRayToDecimal(data.liquidityRate)) * 100
    const apyBaseBorrow = aprToApyDecimal(aprRayToDecimal(data.variableBorrowRate)) * 100

    const marketUrlParam = toMarketUrlParam(market)
    const url = `https://app.ploutos.money/reserve-overview/?underlyingAsset=${r.tokenAddress.toLowerCase()}&marketName=proto_${marketUrlParam}_v3`

    // Merkl match by chainId + (aToken | underlying)
    const aTok = normAddr(aTokens[i].tokenAddress)
    const uTok = normAddr(r.tokenAddress)

    const mAT = chainId ? merklMap.get(`${chainId}:${aTok}`) : undefined
    const mUA = chainId ? merklMap.get(`${chainId}:${uTok}`) : undefined

    let apyReward
    let apyRewardBorrow
    const rewardSet = new Set()

    if (mAT?.supply) {
      if (mAT.supply.apr > 0) apyReward = (apyReward || 0) + mAT.supply.apr
      for (const rt of mAT.supply.rewardTokens || []) rewardSet.add(rt)
    }
    if (mUA?.supply) {
      if (mUA.supply.apr > 0) apyReward = (apyReward || 0) + mUA.supply.apr
      for (const rt of mUA.supply.rewardTokens || []) rewardSet.add(rt)
    }
    if (mAT?.borrow) {
      if (mAT.borrow.apr > 0) apyRewardBorrow = (apyRewardBorrow || 0) + mAT.borrow.apr
      for (const rt of mAT.borrow.rewardTokens || []) rewardSet.add(rt)
    }
    if (mUA?.borrow) {
      if (mUA.borrow.apr > 0) apyRewardBorrow = (apyRewardBorrow || 0) + mUA.borrow.apr
      for (const rt of mUA.borrow.rewardTokens || []) rewardSet.add(rt)
    }

    const poolObj = {
      pool: `${aTokens[i].tokenAddress}-${(market === 'avax' ? 'avalanche' : market)}`.toLowerCase(),
      chain: chainOut,
      project: 'ploutos-money',
      symbol: r.symbol,
      tvlUsd,
      apyBase,
      apyBaseBorrow,
      underlyingTokens: [r.tokenAddress],
      totalSupplyUsd,
      totalBorrowUsd,
      ltv: cfg.ltv / 10000,
      borrowable: cfg.borrowingEnabled,
      url,
    }

    const rewardTokens = setToArray(rewardSet)
    if (rewardTokens.length) poolObj.rewardTokens = rewardTokens
    if (apyReward > 0) poolObj.apyReward = apyReward       // Merkl APR уже в процентах
    if (apyRewardBorrow > 0) poolObj.apyRewardBorrow = apyRewardBorrow

    out.push(poolObj)
  }

  return out
}

async function apy() {
  const markets = Object.keys(protocolDataProviders)
  const res = await Promise.allSettled(markets.map(m => getApy(m)))
  return res
    .filter(r => r.status === 'fulfilled')
    .flatMap(r => r.value)
    .filter(p => utils.keepFinite(p))
}

module.exports = {
  timetravel: false,
  apy,
}
