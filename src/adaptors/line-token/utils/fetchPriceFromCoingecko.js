const utils = require('../../utils');

module.exports = async function fetchPriceFromCoingecko(tokenAddress) {
  try {
    const data = await utils.getData(
      `https://api.coingecko.com/api/v3/coins/kava/contract/${tokenAddress.toLowerCase()}`
    );

    return data?.market_data?.current_price?.usd || 0;
  } catch {
    return 0;
  }
};
