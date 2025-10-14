const sdk = require('@defillama/sdk')
const axios = require('axios')
const utils = require('../utils')

const CHAIN = 'ethereum'
const SUSDf = '0xc8CF6D7991f15525488b2A83Df53468D682Ba4B0'  // sUSDf (ERC-4626)
const USDf  = '0xFa2B947eEc368f42195f24F36d2aF29f7c24CeC2'

const abi = {
  convertToAssets: { "inputs":[{"internalType":"uint256","name":"shares","type":"uint256"}],"name":"convertToAssets","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function" },
  totalAssets: { "inputs":[],"name":"totalAssets","outputs":[{"internalType":"uint256","name":"" ,"type":"uint256"}],"stateMutability":"view","type":"function" },
}

const SHARES = BigInt('1000000000000000000000000')  // 1e24
const SCALE  = BigInt('1000000000000')              // 1e12

async function getBlockAt(ts, chain = CHAIN) {
  const { data } = await axios.get(`https://coins.llama.fi/block/${chain}/${ts}`)
  return { block: data.height || data.number, ts: data.timestamp || ts }
}

async function readRate(blockTag) {
  const { output } = await sdk.api.abi.call({
    target: SUSDf,
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
  const exp = 86400 / seconds
  const daily = Math.pow(q, exp) - 1
  return daily
}

async function computeApyBase() {
  const nowTs = Math.floor(Date.now() / 1000)
  const WEEK = [86400 * 7]

  const [{ block: bNow, ts: tNow }, { block: bPast, ts: tPast }] = await Promise.all([
    getBlockAt(nowTs),
    getBlockAt(nowTs - WEEK),
  ])
  const [rNow, rPast] = await Promise.all([readRate(bNow), readRate(bPast)])
  if (rNow !== 0n && rPast !== 0n && rNow !== rPast) {
    const daily = ratioToDaily(rNow, rPast, Math.max(1, tNow - tPast))
    if (daily) {
      const aprBase = daily * 365 * 100
      const apyBase = utils.aprToApy(aprBase, 365)
      return { apyBase }
    }
  }
  
  return { apyBase: 0 }
}

async function apy() {
  const { block: currentBlock } = await getBlockAt(Math.floor(Date.now() / 1000))

  const { output: totalAssetsBn } = await sdk.api.abi.call({
    target: SUSDf,
    abi: abi.totalAssets,
    chain: CHAIN,
    block: currentBlock,
  })
  
  const priceKeyU = `ethereum:${USDf}`
  let price = 1
  try {
    const { data } = await axios.get(`https://coins.llama.fi/prices/current/${priceKeyU}`)
    price = data.coins?.[priceKeyU]?.price ?? 1
  } catch (_) {}
  
  const tvlUsd = Number(totalAssetsBn) / 1e18 * price

  const { apyBase } = await computeApyBase()

  return [{
    pool: `${SUSDf}-${CHAIN}`,
    chain: 'Ethereum',
    project: 'falcon-finance',
    symbol: "sUSDf",
    tvlUsd,
    apyBase,
    underlyingTokens: [USDf],
    poolMeta: 'ERC-4626: USDf → sUSDf',
    url: 'https://app.falcon.finance/earn',
  }]
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.falcon.finance/earn',
}
