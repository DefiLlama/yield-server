const utils = require('../utils');

const API_URL = 'https://api.venus.io/api/governance/venus';

const getApy = async () => {
  const markets = await utils.getData(API_URL);
  const marketsData = markets.data.markets;

  const pools = marketsData.map((market) => ({
    pool: market.address,
    chain: utils.formatChain('binance'),
    project: 'venus',
    symbol: market.underlyingSymbol,
    tvlUsd: Number(market.totalSupplyUsd) - Number(market.totalBorrowsUsd),
    apy: Number(market.supplyApy) + Number(market.supplyVenusApy),
  }));

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
