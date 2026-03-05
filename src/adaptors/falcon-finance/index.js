const sdk = require('@defillama/sdk')
const axios = require('axios')
const utils = require('../utils')

const CHAIN = 'ethereum'
const SUSDf = '0xc8CF6D7991f15525488b2A83Df53468D682Ba4B0'  // sUSDf (ERC-4626)
const USDf  = '0xFa2B947eEc368f42195f24F36d2aF29f7c24CeC2'

const FF    = '0xFA1C09fC8B491B6A4d3Ff53A10CAd29381b3F949'
const sFF   = '0x1a0c3ffcbd101c6f2f6650ded9964c4a568c4d72'

const abi = {
  convertToAssets: { "inputs":[{"internalType":"uint256","name":"shares","type":"uint256"}],"name":"convertToAssets","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function" },
  totalAssets:     { "inputs":[],"name":"totalAssets","outputs":[{"internalType":"uint256","name":"" ,"type":"uint256"}],"stateMutability":"view","type":"function" },
}

const DAY = 86_400
const SHARES = BigInt('1000000000000000000000000')  // 1e24
const SCALE  = BigInt('1000000000000')  

async function getBlockAt(ts, chain = CHAIN) {
  const { data } = await axios.get(`https://coins.llama.fi/block/${chain}/${ts}`)
  return { block: data.height || data.number, ts: data.timestamp || ts }
}

async function readRate(blockTag, vault) {
  const { output } = await sdk.api.abi.call({
    target: vault,
    abi: abi.convertToAssets,
    params: [SHARES.toString()],
    chain: CHAIN,
    block: blockTag,
  })
  return BigInt(output)
}

function ratioToDaily(rNow, rPrev, secondsBigOrNum) {
  if (rPrev === 0n || rNow === 0n) return 0
  const qFP = (rNow * SCALE) / rPrev
  const q = Number(qFP) / Number(SCALE)
  if (!(q > 0) || !isFinite(q)) return 0
  const seconds = Number(secondsBigOrNum) || 1
  const exp = DAY / seconds
  return Math.pow(q, exp) - 1
}

async function computeApyBase(vault) {
  const nowTs = Math.floor(Date.now() / 1e3)
  const WEEK = 7 * DAY

  const [{ block: bNow, ts: tNow }, { block: bPast, ts: tPast }] = await Promise.all([
    getBlockAt(nowTs),
    getBlockAt(nowTs - WEEK),
  ])

  const [rNow, rPast] = await Promise.all([readRate(bNow, vault), readRate(bPast, vault)])
  if (rNow === 0n || rPast === 0n || rNow === rPast) return 0

  const daily = ratioToDaily(rNow, rPast, Math.max(1, tNow - tPast))
  if (!daily) return 0

  const aprBase = daily * 365 * 100
  return utils.aprToApy(aprBase, 365) // number
}

async function getData(vault, underlying) {
  const { output: totalAssetsBn } = await sdk.api.abi.call({
    target: vault,
    abi: abi.totalAssets,
    chain: CHAIN,
  })

  const priceKey = `${CHAIN}:${underlying}`
  let price = 1
  try {
    const { data } = await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
    price = data.coins?.[priceKey]?.price ?? 1
  } catch (_) {}

  const tvlUsd = (Number(totalAssetsBn) / 1e18) * price
  const apyBase = await computeApyBase(vault)

  return { tvlUsd, apyBase }
}

async function apy() {
  const [sUSDfData, sFFData] = await Promise.all([
    getData(SUSDf, USDf),
    getData(sFF,   FF),
  ])

  return [
    {
      pool: `${SUSDf}-${CHAIN}`,
      chain: 'Ethereum',
      project: 'falcon-finance',
      symbol: 'sUSDf',
      tvlUsd: sUSDfData.tvlUsd,
      apyBase: sUSDfData.apyBase,
      underlyingTokens: [USDf],
      poolMeta: 'ERC-4626: USDf → sUSDf',
      url: 'https://app.falcon.finance/earn/classic',
    },
    {
      pool: `${sFF}-${CHAIN}`,
      chain: 'Ethereum',
      project: 'falcon-finance',
      symbol: 'sFF',
      tvlUsd: sFFData.tvlUsd,
      apyBase: sFFData.apyBase,
      underlyingTokens: [FF],
      poolMeta: 'ERC-4626: FF → sFF',
      url: 'https://app.falcon.finance/earn/classic',
    },
  ]
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.falcon.finance/earn/classic',
}
