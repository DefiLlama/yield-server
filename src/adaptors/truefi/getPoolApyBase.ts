const BigNumber = require('bignumber.js')
const erc20Abi = require('./abis/erc20.json')
const Web3 = require('web3')
const dotenv = require('dotenv')
dotenv.config()

const connection = process.env.INFURA_CONNECTION
const web3 = new Web3(connection)

const YEAR_IN_DAYS = 365
const SECOND_IN_MS = 1000
const DAY_IN_SECONDS = 24 * 60 * 60

const PRECISION = 10 ** 10
const APY_PRECISION = 10_000

const LENDER_ADDRESS = '0xa606dd423dF7dFb65Efe14ab66f5fDEBf62FF583'

interface Loan {
  amount: typeof BigNumber
  apy: number
  poolAddress: string
  status: string
  startDate: number
  endDate: number
}

function getInterestForPeriod(periodInDays: number, apyInBps: number) {
  return 1 + (apyInBps / APY_PRECISION) * (periodInDays / YEAR_IN_DAYS)
}

async function getLoanWeightedApyValue({ apy, startDate, endDate, id }: Loan, nowInDays: number) {
  if(nowInDays > endDate) {
    return new BigNumber(0)
  }

  const loanDuration = (endDate - startDate) / DAY_IN_SECONDS
  const daysPassed = (nowInDays - startDate) / DAY_IN_SECONDS

  const totalInterest = getInterestForPeriod(loanDuration, apy)
  const accruedInterest = getInterestForPeriod(daysPassed, apy)
  
  const loanTokenPrice = Math.floor(accruedInterest / totalInterest * PRECISION)

  const loan = new web3.eth.Contract(erc20Abi, id)
  const lenderBalance = new BigNumber(await loan.methods.balanceOf(LENDER_ADDRESS).call())

  const scaledAmount = lenderBalance.multipliedBy(loanTokenPrice).div(PRECISION)
  return scaledAmount.multipliedBy(apy)
}

async function getPoolApyBase(poolLoans: Loan[], poolValue: number, tokenDecimals: number) {
  const nowInDays = Date.now() / SECOND_IN_MS

  const loanWeightedApyValues = await Promise.all(poolLoans.map(async (loan) => await getLoanWeightedApyValue(loan, nowInDays)))
  const loansWeightedApySum = loanWeightedApyValues.reduce((sum, value) => sum.plus(value), new BigNumber(0))

  const poolApyBaseInBps = loansWeightedApySum.div(poolValue).toNumber() / (10 ** tokenDecimals)
  return poolApyBaseInBps / 100
}

module.exports = {
  getPoolApyBase
}
