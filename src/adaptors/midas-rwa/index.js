const { computeAPY } = require('./computeAPY');
const { contractAddresses } = require('./addresses');
const { fetchBaseAssetPrices } = require('./fetchBaseAssetPrices');
const { fetchTokenData } = require('./fetchTokenData');
const { formatUnits } = require('ethers/lib/utils');

const poolsFunction = async () => {
  try {
    const baseAssetPrices = await fetchBaseAssetPrices();
    const data = await fetchTokenData(baseAssetPrices);
    const results = [];

    for (const [chain, tokens] of Object.entries(contractAddresses)) {
      for (const [token, tokenConfig] of Object.entries(tokens)) {
        const tokenData = data[chain]?.[token];

        if (!tokenData) {
          console.warn(`MidasRWA: Missing data for ${token} on ${chain}`);
          continue;
        }

        const apy = computeAPY(tokenData);

        const rawTvl =
          (tokenData.supply * tokenData.currentPrice) / BigInt(1e18);
        const tvlUsd = Number(formatUnits(rawTvl, 18));

        const result = {
          pool: `${tokenConfig.address.toLowerCase()}-${chain.toLowerCase()}`,
          chain,
          project: 'midas-rwa',
          symbol: token,
          tvlUsd,
          apyBase: apy,
          url: tokenConfig.url,
        };

        results.push(result);
      }
    }

    return results;
  } catch (error) {
    console.error('MidasRWA: Error in poolsFunction:', error);
    throw error;
  }
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://midas.app/',
};
