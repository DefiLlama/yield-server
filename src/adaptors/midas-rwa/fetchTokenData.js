const { contractAddresses } = require('./addresses');
const { fetchCurrentData, processToken } = require('./tokenHelpers');

// Fetch all token data for APY calculation
async function fetchTokenData(basePrices = null) {
  const data = {};

  const chainPromises = Object.entries(contractAddresses).map(
    async ([chain, tokens]) => {
      if (Object.keys(tokens).length === 0) {
        return { chain, data: {} };
      }

      const { priceResults, supplyResults } = await fetchCurrentData(
        chain,
        tokens
      );
      const chainData = {};

      const tokenPromises = Object.entries(tokens).map(
        async ([token, tokenData], index) => {
          return processToken(
            token,
            tokenData,
            chain,
            priceResults.output[index],
            supplyResults.output[index],
            basePrices
          );
        }
      );

      const tokenResults = await Promise.all(tokenPromises);

      tokenResults.forEach((result) => {
        if (result) {
          chainData[result.token] = result.data;
        }
      });

      return { chain, data: chainData };
    }
  );

  const chainResults = await Promise.all(chainPromises);

  chainResults.forEach(({ chain, data: chainData }) => {
    data[chain] = chainData;
  });

  return data;
}

module.exports = { fetchTokenData };
