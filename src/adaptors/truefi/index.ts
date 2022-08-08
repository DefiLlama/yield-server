const { getPoolValue } = require('./getPoolValue');
const { getActiveLoans } = require('./getActiveLoans')
const { getPoolApyBase } = require('./getPoolApyBase')
const BigNumber = require('bignumber.js')
const utils = require('../utils')
const superagent = require('superagent')

const TRU_ADDRESS = '0x4c19596f5aaff459fa38b0f7ed92f11ae6543784'

const getAddressKey = (address: string) => `ethereum:${address}`

interface PoolInfo {
  symbol: string
  address: string
  decimals: number
  tokenAddress: string
}

const POOL_INFOS: PoolInfo[] = [
  {
    symbol: 'tfUSDC',
    address: '0xA991356d261fbaF194463aF6DF8f0464F8f1c742'.toLowerCase(),
    decimals: 6,
    tokenAddress: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'.toLowerCase()
  }
]

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

const buildPoolAdapter = async ({ address, decimals, symbol, tokenAddress }: PoolInfo, tokenPrice: number, allActiveLoans: Loan[]): Promise<PoolAdapter> => {
  const poolActiveLoans = allActiveLoans.filter(({ poolAddress }) => poolAddress === address)
  const poolValue = await getPoolValue(address, decimals)

  return {
    pool: address,
    chain: utils.formatChain('ethereum'),
    project: 'truefi',
    symbol,
    tvlUsd: poolValue * tokenPrice,
    apyBase: 0, // TODO: implement
    apyReward: 0, // TODO: implement
    rewardTokens: [TRU_ADDRESS],
    underlyingTokens: [tokenAddress],
  }
}

const apy = async () => {
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: POOL_INFOS.map(({ tokenAddress }) => tokenAddress).map(getAddressKey),
    })
  ).body.coins

  const activeLoans = await getActiveLoans()

  const adapters: PoolAdapter[] = []
  for(const poolInfo of POOL_INFOS) {
    const tokenPriceKey = getAddressKey(poolInfo.tokenAddress)
    const tokenPrice = prices[tokenPriceKey].price
    const adapter = await buildPoolAdapter(poolInfo, tokenPrice, activeLoans)
    adapters.push(adapter)
  }

  return adapters
}

module.exports = {
  timetravel: false, // TODO: verify
  apy // TODO: implement
}