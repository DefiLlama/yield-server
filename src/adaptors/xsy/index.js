const utils = require('../utils')
const sdk = require('@defillama/sdk')
const axios = require('axios')

const poolsFunction = async () => {
  const yUTY_VAULT = '0x580d5E1399157FD0d58218b7A514b60974F2AB01' // ERC4626 Proxy
  const UTY_TOKEN = '0xDBc5192A6B6FfEe7451301bb4ec312f844F02B4A'
  const CHAIN = 'avax'

  // ERC4626 ABI functions
  const ERC4626_TOTAL_ASSETS = {
    "inputs": [],
    "name": "totalAssets",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }

  const ERC4626_TOTAL_SUPPLY = {
    "inputs": [],
    "name": "totalSupply",
    "outputs": [{"internalType": "uint256", "name": "", "type": "uint256"}],
    "stateMutability": "view",
    "type": "function"
  }

  // Get current exchange rate data
  const [totalAssets, totalSupply] = await Promise.all([
    sdk.api.abi.call({
      abi: ERC4626_TOTAL_ASSETS,
      chain: CHAIN,
      target: yUTY_VAULT,
    }),
    sdk.api.abi.call({
      abi: ERC4626_TOTAL_SUPPLY,
      chain: CHAIN,
      target: yUTY_VAULT,
    })
  ])

  const totalAssetsNum = Number(totalAssets.output) / 1e18
  const totalSupplyNum = Number(totalSupply.output) / 1e18

  // Calculate current exchange rate (assets per share)
  const currentExchangeRate = totalSupplyNum > 0 ? totalAssetsNum / totalSupplyNum : 1

  // Get historical data for APY calculation
  const now = Math.floor(Date.now() / 1000)
  const timestamp1dayAgo = now - 86400
  const timestamp7dayAgo = now - 86400 * 7

  // Get historical blocks using DefiLlama API
  const [blockResponse1d, blockResponse7d] = await Promise.all([
    axios.get(`https://coins.llama.fi/block/${CHAIN}/${timestamp1dayAgo}`),
    axios.get(`https://coins.llama.fi/block/${CHAIN}/${timestamp7dayAgo}`)
  ])

  const block1dayAgo = blockResponse1d.data.height
  const block7dayAgo = blockResponse7d.data.height

  // Get historical exchange rates
  const [
    totalAssets1d,
    totalSupply1d,
    totalAssets7d,
    totalSupply7d
  ] = await Promise.all([
    sdk.api.abi.call({
      abi: ERC4626_TOTAL_ASSETS,
      chain: CHAIN,
      target: yUTY_VAULT,
      block: block1dayAgo,
    }),
    sdk.api.abi.call({
      abi: ERC4626_TOTAL_SUPPLY,
      chain: CHAIN,
      target: yUTY_VAULT,
      block: block1dayAgo,
    }),
    sdk.api.abi.call({
      abi: ERC4626_TOTAL_ASSETS,
      chain: CHAIN,
      target: yUTY_VAULT,
      block: block7dayAgo,
    }),
    sdk.api.abi.call({
      abi: ERC4626_TOTAL_SUPPLY,
      chain: CHAIN,
      target: yUTY_VAULT,
      block: block7dayAgo,
    })
  ])

  const totalAssets1dNum = Number(totalAssets1d.output) / 1e18
  const totalSupply1dNum = Number(totalSupply1d.output) / 1e18
  const totalAssets7dNum = Number(totalAssets7d.output) / 1e18
  const totalSupply7dNum = Number(totalSupply7d.output) / 1e18

  const exchangeRate1d = totalSupply1dNum > 0 ? totalAssets1dNum / totalSupply1dNum : 1
  const exchangeRate7d = totalSupply7dNum > 0 ? totalAssets7dNum / totalSupply7dNum : 1

  // Calculate APY from exchange rate growth
  const apy1d = ((currentExchangeRate / exchangeRate1d) ** 365 - 1) * 100
  const apy7d = ((currentExchangeRate / exchangeRate7d) ** (365/7) - 1) * 100

  // Use 7-day APY as it's more stable, fallback to 1-day if needed
  const apyBase = isFinite(apy7d) && apy7d > 0 ? apy7d : (isFinite(apy1d) && apy1d > 0 ? apy1d : 0)

  // Get UTY price for TVL calculation
  const prices = await utils.getPrices([UTY_TOKEN], CHAIN)
  const utyPrice = prices.pricesByAddress[UTY_TOKEN.toLowerCase()] || 1 // Fallback to $1 if price not available

  const yUTYPool = {
    pool: `${yUTY_VAULT}-${CHAIN}`,
    chain: utils.formatChain(CHAIN),
    project: 'xsy',
    symbol: utils.formatSymbol('yUTY'),
    tvlUsd: totalAssetsNum * utyPrice,
    apyBase: apyBase,
    underlyingTokens: [UTY_TOKEN],
    poolMeta: 'ERC4626 Staking Vault',
  }

  return [yUTYPool]
}

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://xsy.fi/',
}
