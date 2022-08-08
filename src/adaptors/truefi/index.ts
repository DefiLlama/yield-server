const Web3 = require('web3')
const utils = require('../utils')
const poolAbi = require('./poolAbi.json')
const dotenv = require('dotenv')
dotenv.config()

const connection = process.env.INFURA_CONNECTION
const web3 = new Web3(connection)

const unitsMap = {
  6: 'mwei',
  18: 'ether'
}

const USDC_DECIMALS = 6
const USDC_ADDRESS = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
const USDC_POOL_ADDRESS = '0xA991356d261fbaF194463aF6DF8f0464F8f1c742'

interface PoolAdapter { 
  pool: string
  chain: string
  project: string
  symbol: string
  tvlUsd: number
  apyBase?: number 
  apyReward?: number
  rewardTokens?: Array<string> 
  underlyingTokens?: Array<string>,
}

const apy = async () => {
  const usdcPrice = 1 // TODO: verify
  const usdcPool = new web3.eth.Contract(poolAbi, USDC_POOL_ADDRESS)
  const usdcPoolValueRaw: string = await usdcPool.methods.poolValue().call()
  const usdcPoolValue = web3.utils.fromWei(usdcPoolValueRaw, unitsMap[USDC_DECIMALS])
  const usdcPoolValueInUsd = usdcPrice * usdcPoolValue

  const usdcPoolAdapter: PoolAdapter = {
    pool: USDC_POOL_ADDRESS,
    chain: utils.formatChain('ethereum'),
    project: 'truefi',
    symbol: 'tfUSDC',
    tvlUsd: 0, // TODO: implement
    apyBase: 0, // TODO: implement
    symbol: 'tfUSDC',
    tvlUsd: usdcPoolValueInUsd, // TODO: implement
    apyBase: 0, // TODO: implement
    apyReward: 0, // TODO: implement
    rewardTokens: [], // TODO: implement
    underlyingTokens: [USDC_ADDRESS],
}

  return [usdcPoolAdapter]
}

module.exports = {
  timetravel: false, // TODO: verify
  apy // TODO: implement
}