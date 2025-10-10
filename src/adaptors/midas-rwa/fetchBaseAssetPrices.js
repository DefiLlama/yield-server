const sdk = require('@defillama/sdk');
const { BASE_ASSET_ORACLES } = require('./addresses');
const basicDataFeedAbi = require('./abi/basicDatafeedAbi.json');
const { formatUnits } = require('ethers/lib/utils');

async function fetchBaseAssetPrices() {
  const prices = {};

  const oraclesByChain = Object.entries(BASE_ASSET_ORACLES).reduce(
    (acc, [asset, config]) => {
      if (!acc[config.chain]) {
        acc[config.chain] = [];
      }
      acc[config.chain].push({
        asset,
        address: config.address,
        decimals: config.decimals,
      });
      return acc;
    },
    {}
  );

  const chainPromises = Object.entries(oraclesByChain).map(
    async ([chain, oracles]) => {
      try {
        const multicallResult = await sdk.api.abi.multiCall({
          abi: basicDataFeedAbi.find((m) => m.name === 'latestRoundData'),
          calls: oracles.map((oracle) => ({
            target: oracle.address,
          })),
          chain,
          permitFailure: true,
        });

        const chainPrices = {};
        multicallResult.output.forEach((result, index) => {
          const oracle = oracles[index];
          if (result.success && result.output && result.output[1]) {
            const price = Number(
              formatUnits(result.output[1], oracle.decimals)
            );
            chainPrices[oracle.asset] = price;
          } else {
            console.warn(
              `MidasRWA: Failed to fetch price for ${oracle.asset} on ${chain}`
            );
          }
        });

        return chainPrices;
      } catch (error) {
        console.warn(
          `MidasRWA: Failed to fetch prices for chain ${chain}:`,
          error.message
        );
        return {};
      }
    }
  );

  const chainResults = await Promise.all(chainPromises);

  chainResults.forEach((chainPrices) => {
    Object.assign(prices, chainPrices);
  });

  return prices;
}

module.exports = { fetchBaseAssetPrices };
