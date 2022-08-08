const Web3 = require('web3')
const utils = require('../utils')
const poolAbi = require('./abis/poolAbi.json')
const dotenv = require('dotenv')
const superagent = require('superagent')
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

const TRU_ADDRESS = '0x4c19596f5aaff459fa38b0f7ed92f11ae6543784'

const getAddressKey = (address: string) => `ethereum:${address.toLowerCase()}`

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

async function getPoolValueInUsd(poolAddress: string, tokenPrice: number, tokenDecimals: number) {
  const pool = new web3.eth.Contract(poolAbi, poolAddress)
  const poolValueRaw: string = await pool.methods.poolValue().call()
  const poolValue = web3.utils.fromWei(poolValueRaw, unitsMap[tokenDecimals])
  return tokenPrice * poolValue
}

const apy = async () => {
  const usdcKey = getAddressKey(USDC_ADDRESS)
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [usdcKey],
    })
  ).body.coins
  const usdcPrice = prices[usdcKey].price

  const usdcPoolAdapter: PoolAdapter = {
    pool: USDC_POOL_ADDRESS,
    chain: utils.formatChain('ethereum'),
    project: 'truefi',
    symbol: 'tfUSDC',
    tvlUsd: await getPoolValueInUsd(USDC_POOL_ADDRESS, usdcPrice, 6),
    apyBase: 0, // TODO: implement
    apyReward: 0, // TODO: implement
    rewardTokens: [TRU_ADDRESS],
    underlyingTokens: [USDC_ADDRESS],
}

  return [usdcPoolAdapter]
}

module.exports = {
  timetravel: false, // TODO: verify
  apy // TODO: implement
}