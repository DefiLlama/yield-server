const Web3 = require('web3')
const BigNumber = require('bignumber.js')
const superagent = require('superagent')
const dotenv = require('dotenv')
dotenv.config({ path: './config.env' })

const { getPoolValue } = require('./getPoolValue');
const { getActiveLoans } = require('./getActiveLoans')
const { getPoolApyBase } = require('./getPoolApyBase')
const { getPoolApyRewards } = require('./getPoolApyRewards')
const multifarmAbi = require('./abis/multifarm.json')
const distributorAbi = require('./abis/distributor.json')
const utils = require('../utils')

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
  },
  {
    symbol: 'tfUSDT',
    address: '0x6002b1dcB26E7B1AA797A17551C6F487923299d7'.toLowerCase(),
    decimals: 6,
    tokenAddress: '0xdAC17F958D2ee523a2206206994597C13D831ec7'.toLowerCase()
  },
  {
    symbol: 'tfTUSD',
    address: '0x97cE06c3e3D027715b2d6C22e67D5096000072E5'.toLowerCase(),
    decimals: 18,
    tokenAddress: '0x0000000000085d4780b73119b644ae5ecd22b376'.toLowerCase()
  },
  {
    symbol: 'tfBUSD',
    address: '0x1Ed460D149D48FA7d91703bf4890F97220C09437'.toLowerCase(),
    decimals: 18,
    tokenAddress: '0x4fabb145d64652a948d72533023f6e7a623c7c53'.toLowerCase()
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
  timetravel: false,
  apy
}