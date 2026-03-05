const sdk = require('@defillama/sdk');
const { convertPriceToUSD } = require('./convertPriceToUSD');
const { getAggregatorAddress, getPriceData } = require('./chainlinkHelpers');
const dataFeedAbi = require('./abi/dataFeedAbi.json');
const erc20Abi = require('./abi/erc20Abi.json');

const PRICE_SCALE_FACTOR = BigInt(10 ** 10);

// Fetch current prices and supply data
async function fetchCurrentData(chain, tokens) {
  const priceCalls = [];
  const supplyCalls = [];

  for (const [token, tokenData] of Object.entries(tokens)) {
    priceCalls.push({
      target: tokenData.dataFeed,
      params: [],
      token,
    });

    supplyCalls.push({
      target: tokenData.address,
      params: [],
      token,
    });
  }

  const [priceResults, supplyResults] = await Promise.all([
    sdk.api.abi.multiCall({
      abi: dataFeedAbi.find((m) => m.name === 'getDataInBase18'),
      calls: priceCalls,
      chain,
      permitFailure: true,
    }),
    sdk.api.abi.multiCall({
      abi: erc20Abi.find((m) => m.name === 'totalSupply'),
      calls: supplyCalls,
      chain,
      permitFailure: true,
    }),
  ]);

  return { priceResults, supplyResults };
}

// Convert Chainlink price to USD
function convertPrice(rawAnswer, denomination, basePrices) {
  const priceBase18 = BigInt(rawAnswer.toString()) * PRICE_SCALE_FACTOR;
  return convertPriceToUSD(priceBase18, denomination, basePrices);
}

// Process single token data
async function processToken(
  token,
  tokenData,
  chain,
  priceResult,
  supplyResult,
  basePrices
) {
  if (!priceResult?.success || !supplyResult?.success) {
    console.warn(
      `MidasRWA: Failed to fetch current data for ${token} on ${chain}, skipping`
    );
    return null;
  }

  const denomination = tokenData.denomination ?? 'USD';
  const currentPrice = convertPriceToUSD(
    priceResult.output,
    denomination,
    basePrices
  );
  const supply = BigInt(supplyResult.output);

  const aggregatorAddress = await getAggregatorAddress(
    tokenData.dataFeed,
    chain
  );

  if (!aggregatorAddress) {
    console.warn(
      `MidasRWA: No aggregator address found for ${token} on ${chain}, skipping`
    );
    return null;
  }

  const priceData = await getPriceData(aggregatorAddress, chain);

  if (!priceData) {
    console.warn(
      `MidasRWA: No price data found for ${token} on ${chain}, skipping`
    );
    return null;
  }

  return {
    token,
    data: {
      currentPrice: convertPrice(
        priceData.latest.answer,
        denomination,
        basePrices
      ),
      historicalPrice: convertPrice(
        priceData.historical.answer,
        denomination,
        basePrices
      ),
      supply,
      currentTimestamp: priceData.latest.updatedAt,
      historicalTimestamp: priceData.historical.updatedAt,
    },
  };
}

module.exports = {
  fetchCurrentData,
  processToken,
};
