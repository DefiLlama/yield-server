const utils = require('../../utils');

/**
 * Fetch token prices from DefiLlama
 */
async function fetchTokenPrices(tokenAddresses, chainName) {
  const tokenPrices = {};

  const priceKeys = Array.from(tokenAddresses)
    .filter((addr) => addr)
    .map((addr) => `${chainName}:${addr}`);

  if (priceKeys.length === 0) {
    return tokenPrices;
  }

  try {
    const prices = await utils.getData(
      `https://coins.llama.fi/prices/current/${priceKeys.join(',')}`
    );

    Object.entries(prices.coins || {}).forEach(([key, data]) => {
      const address = key.split(':')[1]?.toLowerCase();
      if (address) {
        tokenPrices[address] = data.price || 0;
      }
    });
  } catch (error) {
    console.error('Error fetching token prices:', error);
  }

  return tokenPrices;
}

module.exports = {
  fetchTokenPrices,
};
