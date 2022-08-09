const Web3 = require('web3')
const BigNumber = require('bignumber.js')
const multifarmAbi = require('./abis/multifarm.json')
const distributorAbi = require('./abis/distributor.json')
const dotenv = require('dotenv')
dotenv.config()

// TODO: extract to index
const connection = process.env.INFURA_CONNECTION
const web3 = new Web3(connection)

const YEAR_IN_DAYS = 365
const DAY_IN_SECONDS = 24 * 60 * 60

const MULTIFARM_ADDRESS = '0xec6c3FD795D6e6f202825Ddb56E01b3c128b0b10'.toLowerCase()
const DISTRIBUTOR_ADDRESS = '0xc7AB606e551bebD69f7611CdA1Fc473f8E5b8f70'.toLowerCase()

async function getPoolApyRewards(poolAddress: string, truPrice: number) {
  const multifarm = new web3.eth.Contract(multifarmAbi, MULTIFARM_ADDRESS)
  const poolStakes = new BigNumber(await multifarm.methods.stakes(poolAddress).call())
  const poolShare = new BigNumber(await multifarm.methods.getShare(poolAddress).call())
  const totalShares = new BigNumber(await multifarm.methods.shares().call())

  const distributor = new web3.eth.Contract(distributorAbi, DISTRIBUTOR_ADDRESS)
  const duration = new BigNumber(await distributor.methods.duration().call())
  const totalAmount = new BigNumber(await distributor.methods.totalAmount().call())

  const divider = duration.multipliedBy(totalShares)
  const dailyRewards = totalAmount.multipliedBy(poolShare).multipliedBy(DAY_IN_SECONDS).div(divider)
  const yearlyRewards = dailyRewards.multipliedBy(YEAR_IN_DAYS)
  const yearlyRewardsInUsd = yearlyRewards.multipliedBy(truPrice)

  return yearlyRewardsInUsd.div(poolStakes).toNumber()
}

module.exports = {
  getPoolApyRewards
}
