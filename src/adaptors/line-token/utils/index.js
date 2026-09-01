const getCurrentLinePrice = require('./getCurrentLinePrice');
const getAllPools = require('./getAllPools');
const getTotalDebt = require('./getTotalDebt');
const getInterestRate = require('./getInterestRate');
const getPoolTokenPriceInUSD = require('./getPoolTokenPriceInUSD');
const fetchPriceFromCoingecko = require('./fetchPriceFromCoingecko');
const getSymbol = require('./getSymbol');
const getDecimals = require('./getDecimals');

module.exports.getCurrentLinePrice = getCurrentLinePrice;
module.exports.getAllPools = getAllPools;
module.exports.getTotalDebt = getTotalDebt;
module.exports.getInterestRate = getInterestRate;
module.exports.getPoolTokenPriceInUSD = getPoolTokenPriceInUSD;
module.exports.fetchPriceFromCoingecko = fetchPriceFromCoingecko;
module.exports.getSymbol = getSymbol;
module.exports.getDecimals = getDecimals;
