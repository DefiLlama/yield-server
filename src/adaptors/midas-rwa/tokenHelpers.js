const sdk = require('@defillama/sdk');
const { convertPriceToUSD } = require('./convertPriceToUSD');
const { getAggregatorAddress, getPriceData } = require('./chainlinkHelpers');
const dataFeedAbi = require('./abi/dataFeedAbi.json');
const basicDataFeedAbi = require('./abi/basicDatafeedAbi.json');
const erc20Abi = require('./abi/erc20Abi.json');

const PRICE_SCALE_FACTOR = BigInt(10 ** 10);

// Most products expose a MidasDataFeed wrapper (`dataFeed`) whose
// `getDataInBase18()` is the unadjusted NAV and whose `aggregator()` points at
// the underlying Chainlink-style feed. A few products (mGLO, mGLOBAL) only have
// growth-adjusted wrappers (deposit +7% / redemption -7%), so for those the
// config carries `aggregator` directly: the NAV is read from the raw feed's
// `latestRoundData()` (8 decimals) and scaled to base18 here.
function scaleToBase18(rawAnswer) {
  return (BigInt(rawAnswer.toString()) * PRICE_SCALE_FACTOR).toString();
}

// Fetch current prices and supply data
async function fetchCurrentData(chain, tokens) {
  const entries = Object.entries(tokens);

  const dataFeedCalls = [];
  const dataFeedIndexes = [];
  const aggregatorCalls = [];
  const aggregatorIndexes = [];

  entries.forEach(([, tokenData], index) => {
    if (tokenData.dataFeed) {
      dataFeedCalls.push({ target: tokenData.dataFeed, params: [] });
      dataFeedIndexes.push(index);
    } else {
      aggregatorCalls.push({ target: tokenData.aggregator, params: [] });
      aggregatorIndexes.push(index);
    }
  });

  const supplyCalls = entries.map(([, tokenData]) => ({
    target: tokenData.address,
    params: [],
  }));

  const [dataFeedResults, aggregatorResults, supplyResults] = await Promise.all(
    [
      dataFeedCalls.length
        ? sdk.api.abi.multiCall({
            abi: dataFeedAbi.find((m) => m.name === 'getDataInBase18'),
            calls: dataFeedCalls,
            chain,
            permitFailure: true,
          })
        : { output: [] },
      aggregatorCalls.length
        ? sdk.api.abi.multiCall({
            abi: basicDataFeedAbi.find((m) => m.name === 'latestRoundData'),
            calls: aggregatorCalls,
            chain,
            permitFailure: true,
          })
        : { output: [] },
      sdk.api.abi.multiCall({
        abi: erc20Abi.find((m) => m.name === 'totalSupply'),
        calls: supplyCalls,
        chain,
        permitFailure: true,
      }),
    ]
  );

  // Re-align both price sources to the token order, normalised to base18.
  const priceOutput = new Array(entries.length);
  dataFeedResults.output.forEach((result, i) => {
    priceOutput[dataFeedIndexes[i]] = result;
  });
  aggregatorResults.output.forEach((result, i) => {
    priceOutput[aggregatorIndexes[i]] =
      result?.success && result.output
        ? { success: true, output: scaleToBase18(result.output[1]) }
        : { success: false };
  });

  return { priceResults: { output: priceOutput }, supplyResults };
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

  const aggregatorAddress =
    tokenData.aggregator ??
    (await getAggregatorAddress(tokenData.dataFeed, chain));

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
