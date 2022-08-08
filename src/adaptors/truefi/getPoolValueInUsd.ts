const Web3 = require('web3')
const poolAbi = require('./abis/poolAbi.json')
const dotenv = require('dotenv')
dotenv.config()

const connection = process.env.INFURA_CONNECTION
const web3 = new Web3(connection)

const unitsMap = {
  6: 'mwei',
  18: 'ether'
}

async function getPoolValueInUsd(poolAddress: string, tokenPrice: number, tokenDecimals: number) {
  const pool = new web3.eth.Contract(poolAbi, poolAddress)
  const poolValueRaw: string = await pool.methods.poolValue().call()
  const poolValue = web3.utils.fromWei(poolValueRaw, unitsMap[tokenDecimals])
  return tokenPrice * poolValue
}

module.exports = {
  getPoolValueInUsd
}
