const getCurrentLinePrice = require('./getCurrentLinePrice');
const getAllPools = require('./getAllPools');
const getTotalDebt = require('./getTotalDebt');
const getInterestRate =  require('./getInterestRate');  
const getPoolTokenPrice = require('./getPoolTokenPrice');
const fetchPriceFromCoingecko = require('./fetchPriceFromCoingecko');
const getSymbol = require('./getSymbol');

module.exports.getCurrentLinePrice = getCurrentLinePrice;
module.exports.getAllPools = getAllPools;
module.exports.getTotalDebt = getTotalDebt;
module.exports.getInterestRate = getInterestRate;
module.exports.getPoolTokenPrice = getPoolTokenPrice;
module.exports.fetchPriceFromCoingecko = fetchPriceFromCoingecko;
module.exports.getSymbol = getSymbol;
