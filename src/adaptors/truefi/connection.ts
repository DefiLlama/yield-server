const Web3 = require('web3')
const dotenv = require('dotenv')
dotenv.config({ path: './config.env' })

const connection = process.env.INFURA_CONNECTION
const web3 = new Web3(connection)

module.exports = { web3 }
