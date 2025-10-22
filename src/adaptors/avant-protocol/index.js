const sdk   = require('@defillama/sdk')
const axios = require('axios')
const utils = require('../utils')

// Avalanche tokens

const avUSD  = '0x24dE8771bC5DdB3362Db529Fc3358F2df3A0E346'
const savUSD = '0x06d47F3fb376649c3A9Dafe069B3D6E35572219E' // Staked avUSD (ERC-4626)

const avBTC  = '0xfd2c2A98009d0cBed715882036e43d26C4289053'
const savBTC = '0x649342c6bff544d82DF1B2bA3C93e0C22cDeBa84' // Staked avBTC (ERC-4626)

// Ethereum tokens

const avETH  = '0x9469470C9878bf3d6d0604831d9A3A366156f7EE'
const savETH = '0xDA06eE2dACF9245Aa80072a4407deBDea0D7e341' // Staked avETH (ERC-4626)
const wETH   = '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'

const abi = {
  convertToAssets: { "inputs":[{"internalType":"uint256","name":"shares","type":"uint256"}],"name":"convertToAssets","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function" },
  totalAssets:     { "inputs":[],"name":"totalAssets","outputs":[{"internalType":"uint256","name":"" ,"type":"uint256"}],"stateMutability":"view","type":"function" },
}

const DAY    = 86_400
const SCALE  = BigInt(1e18)
const SHARES = BigInt(1e18)

async function getBlockAtTimestamp(chain, ts) {
  const { data } = await axios.get(`https://coins.llama.fi/block/${chain}/${ts}`)
  return { block: data.height || data.number, ts: data.timestamp || ts }
}

async function readShareToAssetRatio(chain, blockNumber, vault) {
  const { output } = await sdk.api.abi.call({
    target: vault,
    abi: abi.convertToAssets, 
    params: [SHARES.toString()],
    chain,
    block: blockNumber,
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

async function computeApyBase(chain, vault) {
  const nowTs = Math.floor(Date.now() / 1e3)
  const WEEK = 7 * DAY

  const [{ block: bNow, ts: tNow }, { block: bPast, ts: tPast }] = await Promise.all([
    getBlockAtTimestamp(chain, nowTs),
    getBlockAtTimestamp(chain, nowTs - WEEK),
  ])

  const [rNow, rPast] = await Promise.all([
    readShareToAssetRatio(chain, bNow, vault), 
    readShareToAssetRatio(chain, bPast, vault)
  ])
  if (rNow === 0n || rPast === 0n || rNow === rPast) return 0

  const daily = ratioToDaily(rNow, rPast, Math.max(1, tNow - tPast))
  if (!daily) return 0

  const aprBase = daily * 365 * 100
  return utils.aprToApy(aprBase, 365) // number
}

async function getPrice(chain, token, tokenSubstitute) {
  async function _getPrice(chain, tokenAddress) {
    const priceKey = `${chain}:${tokenAddress}`
    const { data } = await axios.get(`https://coins.llama.fi/prices/current/${priceKey}`)
    price = data.coins?.[priceKey]?.price ?? 0
    return price
  }
  const price = await _getPrice(chain, token)
  if (price) {
    return price
  } else if (tokenSubstitute) {
    return await _getPrice(chain, tokenSubstitute)
  }
  return 1
}

async function getData(chain, vault, underlying, underlyingSubstitute = undefined) {
  const { output: totalAssetsBn } = await sdk.api.abi.call({
    target: vault,
    abi: abi.totalAssets,
    chain,
  })

  const price = await getPrice(chain, underlying, underlyingSubstitute)
  const tvlUsd = (Number(totalAssetsBn) / 1e18) * price
  const apyBase = await computeApyBase(chain, vault)

  return { tvlUsd, apyBase }
}

async function apy() {
  const [savUSDData, savBTCData, savETHData] = await Promise.all([
    getData('avax', savUSD, avUSD),
    getData('avax', savBTC, avBTC),
    getData('ethereum', savETH, avETH, wETH)
  ])

  return [
    {
      pool: `${savUSD}-avax`,
      chain: 'avax',
      project: 'avant-avusd',
      symbol: 'savUSD',
      tvlUsd: savUSDData.tvlUsd,
      apyBase: savUSDData.apyBase,
      underlyingTokens: [avUSD],
      poolMeta: 'ERC-4626: savUSD → avUSD',
      url: 'https://www.avantprotocol.com',
    },
    {
      pool: `${savBTC}-avax`,
      chain: 'avax',
      project: 'avant-avbtc',
      symbol: 'savBTC',
      tvlUsd: savBTCData.tvlUsd,
      apyBase: savBTCData.apyBase,
      underlyingTokens: [avBTC],
      poolMeta: 'ERC-4626: savBTC → avBTC',
      url: 'https://www.avantprotocol.com',
    },
    {
      pool: `${savETH}-ethereum`,
      chain: 'ethereum',
      project: 'avant-aveth',
      symbol: 'savETH',
      tvlUsd: savETHData.tvlUsd,
      apyBase: savETHData.apyBase,
      underlyingTokens: [avETH],
      poolMeta: 'ERC-4626: savETH → avETH',
      url: 'https://www.avantprotocol.com',
    },
  ]
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.avantprotocol.com',
}
