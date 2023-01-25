const utils = require('../utils');

const API_HOST = 'https://api.coingecko.com/api/v3';

/**
 * Get the current price of any cryptocurrencies in any other supported currencies that you need
 * @param {string} ids id of coins, comma-separated if querying more than 1 coin
 * @param {string} vs_currencies vs_currency of coins, comma-separated if querying more than 1 vs_currency
 * @returns {{
 *   [string]: {[string]: number},
 * }} Data value
 */
async function price(ids, currency) {
  return await utils.getData(
    `${API_HOST}/simple/price?ids=${ids}&vs_currencies=${currency}`
  );
}

module.exports = {
  price,
};
