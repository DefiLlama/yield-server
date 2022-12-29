const utils = require('../utils');

const API_HOST = 'https://api.binance.com/api/v3';

/**
 * 24 hour rolling window price change statistics
 * @param {string} ticker - Ticker symbol
 * @returns {{
 *   symbol: string,
 *   priceChange: string,
 *   priceChangePercent: string,
 *   weightedAvgPrice: string,
 *   prevClosePrice: string,
 *   lastPrice: string,
 *   lastQty: string,
 *   bidPrice: string,
 *   bidQty: string,
 *   askPrice: string,
 *   askQty: string,
 *   openPrice: string,
 *   highPrice: string,
 *   lowPrice: string,
 *   volume: string,
 *   quoteVolume: string,
 *   openTime: number,
 *   closeTime: number,
 *   firstId: number,
 *   lastId: number,
 *   lascounttId: number
 * }} Data value
 */
async function ticker24h(symbol) {
  return await utils.getData(`${API_HOST}/ticker/24hr?symbol=${symbol}`);
}

module.exports = {
  ticker24h,
};
