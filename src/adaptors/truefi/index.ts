const { getPoolValue } = require('./getPoolValue');
const { getActiveLoans } = require('./getActiveLoans')
const { getPoolApyBase } = require('./getPoolApyBase')
const { getPoolApyRewards } = require('./getPoolApyRewards')
const Web3 = require('web3')
const BigNumber = require('bignumber.js')
const utils = require('../utils')
const superagent = require('superagent')
const multifarmAbi = require('./abis/multifarm.json')
const distributorAbi = require('./abis/distributor.json')
const dotenv = require('dotenv')
dotenv.config()

// TODO: extract to index
const connection = process.env.INFURA_CONNECTION
const web3 = new Web3(connection)

const MULTIFARM_ADDRESS = '0xec6c3FD795D6e6f202825Ddb56E01b3c128b0b10'.toLowerCase()
const DISTRIBUTOR_ADDRESS = '0xc7AB606e551bebD69f7611CdA1Fc473f8E5b8f70'.toLowerCase()
const TRU_ADDRESS = '0x4c19596f5aaff459fa38b0f7ed92f11ae6543784'.toLowerCase()

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

const buildPoolAdapter = async (
  { address, decimals, symbol, tokenAddress }: PoolInfo,
  tokenPrice: number,
  allActiveLoans: Loan[],
  truPrice: number,
  multifarm: any,
  distributor: any
): Promise<PoolAdapter> => {
  const poolActiveLoans = allActiveLoans.filter(({ poolAddress }) => poolAddress === address)
  const poolValue = await getPoolValue(address, decimals)
  const poolApyBase = await getPoolApyBase(poolActiveLoans, poolValue, decimals)
  const poolApyRewards = await getPoolApyRewards(address, decimals, truPrice, multifarm, distributor)

  return {
    pool: address,
    chain: utils.formatChain('ethereum'),
    project: 'truefi',
    symbol,
    tvlUsd: poolValue * tokenPrice,
    apyBase: poolApyBase,
    apyReward: poolApyRewards,
    rewardTokens: [TRU_ADDRESS],
    underlyingTokens: [tokenAddress],
  }
}

const apy = async () => {
  const prices = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [
        ...POOL_INFOS.map(({ tokenAddress }) => tokenAddress).map(getAddressKey),
        getAddressKey(TRU_ADDRESS)
      ],
    })
  ).body.coins

  const truPrice = prices[getAddressKey(TRU_ADDRESS)].price
  const activeLoans = await getActiveLoans()
  const multifarm = new web3.eth.Contract(multifarmAbi, MULTIFARM_ADDRESS)
  const distributor = new web3.eth.Contract(distributorAbi, DISTRIBUTOR_ADDRESS)

  const adapters: PoolAdapter[] = []
  for(const poolInfo of POOL_INFOS) {
    const tokenPriceKey = getAddressKey(poolInfo.tokenAddress)
    const tokenPrice = prices[tokenPriceKey].price
    const adapter = await buildPoolAdapter(poolInfo, tokenPrice, activeLoans, truPrice, multifarm, distributor)
    adapters.push(adapter)
  }

  return adapters
}

module.exports = {
  timetravel: false, // TODO: verify
  apy // TODO: implement
}