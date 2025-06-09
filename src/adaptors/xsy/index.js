const utils = require('../utils')
const helperUtils = require('../../helper/utils')
const sdk = require('@defillama/sdk')

const poolsFunction = async (timestamp) => {
  const yUTY_VAULT = '0x580d5E1399157FD0d58218b7A514b60974F2AB01' // ERC4626 Proxy
  const UTY_TOKEN = '0xDBc5192A6B6FfEe7451301bb4ec312f844F02B4A'
  const CHAIN = 'avax'

  try {
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

    // get current exchange rate data
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
    const currentExchangeRate = totalSupplyNum > 0 ? totalAssetsNum / totalSupplyNum : 1

    // Get historical blocks for 7-day APY calculation (more stable than 1-day)
    const now = timestamp || Math.floor(Date.now() / 1000)
    const timestamp7dayAgo = now - 86400 * 7

    const [block7dayAgo] = await helperUtils.tryUntilSucceed(
      () => utils.getBlocksByTime([timestamp7dayAgo], CHAIN),
      3
    )

    // Get historical exchange rate
    const [totalAssets7d, totalSupply7d] = await Promise.all([
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

    const totalAssets7dNum = Number(totalAssets7d.output) / 1e18
    const totalSupply7dNum = Number(totalSupply7d.output) / 1e18
    const exchangeRate7d = totalSupply7dNum > 0 ? totalAssets7dNum / totalSupply7dNum : 1

    // calculate 7-day APY with proper compounding periods per year
    const apy7d = ((currentExchangeRate / exchangeRate7d) ** (365/7) - 1) * 100

    // get UTY price for TVL calculation
    const prices = await helperUtils.tryUntilSucceed(
      () => utils.getPrices([UTY_TOKEN], CHAIN),
      3
    )
    const utyPrice = prices.pricesByAddress[UTY_TOKEN.toLowerCase()] || 1

    const yUTYPool = {
      pool: `${yUTY_VAULT}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: 'xsy',
      symbol: utils.formatSymbol('yUTY'),
      tvlUsd: totalAssetsNum * utyPrice,
      apyBase: isFinite(apy7d) && apy7d > 0 ? apy7d : 0,
      underlyingTokens: [UTY_TOKEN],
      poolMeta: 'ERC4626 Staking Vault',
    }

    // filter out pools with invalid financial data
    return [yUTYPool].filter(utils.keepFinite)

  } catch (error) {
    console.error('Error fetching XSY vault data:', error)
    return []
  }
}

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://xsy.fi/',
}
