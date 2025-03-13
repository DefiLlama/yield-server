const { request } = require('graphql-request');
const contractAddresses = require('./addresses');

const GRAPH_URL =
  'https://subgraph.satsuma-prod.com/3e11c7846b93/midas--174381/midas-main-public/api';

const createGetLastMTokenPricesByNetworkIdQuery = (tokens) => {
  const tokenQueryFields = tokens
    .map(
      (token) => `
      ${token}Price: dataFeedAnswers(
        orderBy: "timestamp"
        orderDirection: "desc"
        first: 10
        where: { mToken: $${token} }
      ) {
        timestamp
        answer
        decimals
      }
    `
    )
    .join('\n');

  return `
    query GetLastMTokenPrices(
      ${tokens.map((token) => `$${token}: Bytes!`).join(',\n')}
    ) {
      ${tokenQueryFields}
    }
  `;
};

async function fetchPriceData(tokens) {
  const queryVariables = Object.fromEntries(
    tokens.map((token) => [token, contractAddresses['ethereum'][token].address])
  );

  const query = createGetLastMTokenPricesByNetworkIdQuery(tokens);

  const response = await request(GRAPH_URL, query, queryVariables);

  return Object.fromEntries(
    tokens.map((token) => [
      token,
      response?.[`${token}Price`] ?? null, // Fix: Access the correct property from response
    ])
  );
}

/**
 * Convert raw price data to a numeric value.
 */
function parsePrice(data) {
  return parseFloat(data.answer) / 10 ** parseInt(data.decimals);
}

/**
 * Calculate APY with compounding effect.
 */
function calculateAPY(recentPrice, oldPrice, recentTimestamp, oldTimestamp) {
  const daysElapsed = (recentTimestamp - oldTimestamp) / 86400;
  if (daysElapsed < 6) return 0.0;

  const growthFactor = recentPrice / oldPrice;
  return Number(
    ((Math.pow(growthFactor, 365 / daysElapsed) - 1) * 100).toFixed(2)
  );
}

/**
 * Compute APY for a given mToken.
 */
function computeAPY(priceData) {
  if (!priceData || priceData.length < 2) return 0.0;

  // Most recent data point
  const recentData = priceData[0];
  const recentTimestamp = Number(recentData.timestamp);

  // Calculate six days ago relative to the most recent timestamp
  const sixDaysAgoFromLatestPrice = recentTimestamp - 6 * 86400;

  // Find the first data point that's at least six days old
  let oldestData;
  for (const price of priceData) {
    if (Number(price.timestamp) <= sixDaysAgoFromLatestPrice) {
      oldestData = price;
      break;
    }
  }

  if (!oldestData) return 0.0;

  const recentPrice = parsePrice(recentData);
  const oldPrice = parsePrice(oldestData);
  const oldTimestamp = Number(oldestData.timestamp);

  return calculateAPY(recentPrice, oldPrice, recentTimestamp, oldTimestamp);
}

module.exports = { computeAPY, fetchPriceData };
