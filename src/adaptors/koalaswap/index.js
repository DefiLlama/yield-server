const { ethers } = require('ethers')
const BigNumber = require('bignumber.js')
const utils = require('../utils')

const chain = 'unit0'

const config = {
  factory: '0xcF3Ee60d29531B668Ae89FD3577E210082Da220b',
  fromBlock: 2291892,
  blockTime: 2,
  uiBase: 'https://koalaswap.app',
  rpc: 'https://rpc.unit0.dev',
}

const provider = new ethers.providers.JsonRpcProvider(config.rpc)

const factoryIface = new ethers.utils.Interface([
  'event PoolCreated(address indexed token0, address indexed token1, uint24 indexed fee, int24 tickSpacing, address pool)',
])

const poolIface = new ethers.utils.Interface([
  'event Swap(address indexed sender, address indexed recipient, int256 amount0, int256 amount1, uint160 sqrtPriceX96, uint128 liquidity, int24 tick)',
])

const erc20Abi = [
  'function balanceOf(address) view returns (uint256)',
  'function decimals() view returns (uint8)',
  'function symbol() view returns (string)',
]

async function getTokenInfo(token, poolAddress) {
  const c = new ethers.Contract(token, erc20Abi, provider)
  let balance = '0',
    decimals = 18,
    symbol = token.slice(0, 6)

  try {
    balance = (await c.balanceOf(poolAddress)).toString()
  } catch (_) {}
  try {
    decimals = await c.decimals()
  } catch (_) {}
  try {
    symbol = await c.symbol()
  } catch (_) {}

  return { balance, decimals, symbol }
}

async function getPools() {
  const logs = await provider.getLogs({
    address: config.factory,
    fromBlock: config.fromBlock,
    toBlock: 'latest',
    topics: [factoryIface.getEventTopic('PoolCreated')],
  })

  const pools = logs.map((log) => {
    const parsed = factoryIface.parseLog(log)
    return {
      token0: parsed.args.token0,
      token1: parsed.args.token1,
      fee: parsed.args.fee,
      pool: parsed.args.pool,
    }
  })

  const dataPools = []

  for (const p of pools) {
    const [t0, t1] = await Promise.all([
      getTokenInfo(p.token0, p.pool),
      getTokenInfo(p.token1, p.pool),
    ])

    const prices = await utils.getPrices([p.token0, p.token1], chain)
    const price0 = prices.pricesByAddress[p.token0.toLowerCase()] || 1
    const price1 = prices.pricesByAddress[p.token1.toLowerCase()] || 1

    const tvl0 = new BigNumber(t0.balance)
      .div(`1e${t0.decimals}`)
      .times(price0)
    const tvl1 = new BigNumber(t1.balance)
      .div(`1e${t1.decimals}`)
      .times(price1)
    const tvl = tvl0.plus(tvl1)

    let totalFee0 = 0n
    let totalFee1 = 0n
    try {
      const currentBlock = await provider.getBlockNumber()
      const fromBlock = Math.max(
        currentBlock - Math.floor((24 * 3600) / config.blockTime),
        config.fromBlock,
      )

      const swapLogs = await provider.getLogs({
        address: p.pool,
        fromBlock,
        toBlock: currentBlock,
        topics: [poolIface.getEventTopic('Swap')],
      })

      for (const log of swapLogs) {
        const args = poolIface.parseLog(log).args
        const amt0 = BigInt(args.amount0.toString())
        const amt1 = BigInt(args.amount1.toString())
        if (amt0 > 0n) totalFee0 += (amt0 * BigInt(p.fee)) / 1000000n
        if (amt1 > 0n) totalFee1 += (amt1 * BigInt(p.fee)) / 1000000n
      }
    } catch (_) {}

    const feeValue0 = new BigNumber(totalFee0.toString())
      .div(`1e${t0.decimals}`)
      .times(price0)
    const feeValue1 = new BigNumber(totalFee1.toString())
      .div(`1e${t1.decimals}`)
      .times(price1)
    const feeUsd = feeValue0.plus(feeValue1)

    const aprBn = tvl.gt(0) ? feeUsd.div(tvl).times(36500) : new BigNumber(0)
    const apy = utils.aprToApy(aprBn.toNumber())

    const feeTier = Number(p.fee) / 1_000_000
    const feeUsdNum = isFinite(feeUsd.toNumber()) ? feeUsd.toNumber() : 0
    const volumeUsd1d = feeTier > 0 ? feeUsdNum / feeTier : 0

    dataPools.push({
      pool: p.pool,
      chain,
      project: 'koalaswap',
      symbol: `${t0.symbol}-${t1.symbol}`,
      poolMeta: `${Number(p.fee) / 1e4}%`,
      tvlUsd: tvl.toNumber(),
      apyBase: apy,
      underlyingTokens: [p.token0, p.token1],
      url: `${config.uiBase}/pools/${p.pool}`,
      volumeUsd1d,
    })
  }

  return dataPools
}

async function main() {
  const data = await getPools()
  return data.filter((p) => utils.keepFinite(p))
}

module.exports = {
  timetravel: false,
  apy: main,
}
