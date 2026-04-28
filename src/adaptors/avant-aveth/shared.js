const sdk   = require('@defillama/sdk')
const axios = require('axios')
const utils = require('../utils')

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
    return data.coins?.[priceKey]?.price ?? 0
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
  let totalAssetsBn
  let price

  try {
    ;({ output: totalAssetsBn } = await sdk.api.abi.call({
      target: vault,
      abi: abi.totalAssets,
      chain,
    }))
    price = await getPrice(chain, underlying, underlyingSubstitute)
  } catch (error) {
    console.warn(
      `[avant] failed to fetch TVL data for ${vault} on ${chain}: ${error.message ?? error}`
    )
    return { tvlUsd: 0, apyBase: 0 }
  }

  let apyBase = 0
  try {
    apyBase = await computeApyBase(chain, vault)
  } catch (error) {
    console.warn(
      `[avant] failed to fetch APY data for ${vault} on ${chain}: ${error.message ?? error}`
    )
  }

  // Shares are 18-dec; underlying varies (avETH 18, avUSD/avBTC may not be).
  let assetDecimals = 18
  try {
    const { output: dec } = await sdk.api.abi.call({
      target: underlying,
      abi: 'erc20:decimals',
      chain,
    })
    const parsed = Number(dec)
    if (Number.isFinite(parsed) && parsed > 0) assetDecimals = parsed
  } catch (_) {}

  let pricePerShare
  try {
    const { output } = await sdk.api.abi.call({
      target: vault,
      abi: abi.convertToAssets,
      params: [SHARES.toString()],
      chain,
    })
    pricePerShare = (Number(output) * 10 ** (18 - assetDecimals)) / 1e18
  } catch (_) {}

  const tvlUsd = (Number(totalAssetsBn) / 10 ** assetDecimals) * price

  return { tvlUsd, apyBase, ...(pricePerShare > 0 && { pricePerShare }) }
}

module.exports = {
  getData,
}
