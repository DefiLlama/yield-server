const { parseUnits } = require('ethers/lib/utils');

/**
 * Converts token price from denomination to USD
 * @param {string|BigInt} price - The price value (in base18 format)
 * @param {string} denomination - The denomination (default: 'USD')
 * @param {Object} baseAssetPrices - Base asset prices lookup
 * @returns {BigInt} Converted price in USD (in base18 format)
 */
function convertPriceToUSD(
  price,
  denomination = 'USD',
  baseAssetPrices = null
) {
  const priceBigInt = BigInt(price);

  if (denomination === 'USD') {
    return priceBigInt;
  }

  if (baseAssetPrices && baseAssetPrices[denomination]) {
    const basePriceBigInt = BigInt(
      parseUnits(baseAssetPrices[denomination].toString(), 18)
    );
    return (priceBigInt * basePriceBigInt) / BigInt(10 ** 18);
  }

  return priceBigInt;
}

module.exports = { convertPriceToUSD };
