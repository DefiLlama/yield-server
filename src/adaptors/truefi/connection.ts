const Web3 = require('web3')
const { INFURA_CONNECTION } = require('../../../env')

const web3 = new Web3(INFURA_CONNECTION)

module.exports = { web3 }
