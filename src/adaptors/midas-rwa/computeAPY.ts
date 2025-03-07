const { request } = require('graphql-request');

const GRAPH_URL =
  'https://subgraph.satsuma-prod.com/3e11c7846b93/midas--174381/midas-main-public/api';

/**
 * Fetch historical price data from The Graph API.
 */
async function fetchPriceData(mToken, from, to, limit = 10) {
  try {
    const query = `
      query GetAnswers($mToken: Bytes, $from: BigInt, $to: BigInt, $limit: Int) {
        dataFeedAnswers(
          orderBy: timestamp
          orderDirection: desc
          where: { timestamp_gte: $from, timestamp_lte: $to, mToken: $mToken }
          first: $limit
        ) {
          timestamp
          answer
          decimals
        }
      }
    `;

    const { dataFeedAnswers = [] } = await request(GRAPH_URL, query, {
      mToken,
      from,
      to,
      limit,
    });

    return dataFeedAnswers;
  } catch (error) {
    console.error('GraphQL request failed:', error);
    return [];
  }
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
async function computeAPY(mToken) {
  const now = Math.floor(Date.now() / 1000);
  const sevenDaysAgo = now - 7 * 86400;
  const oneMonthAgo = now - 30 * 86400;

  // Fetch up to 7 recent price data points
  let priceData = await fetchPriceData(mToken, sevenDaysAgo, now, 7);
  if (!priceData.length) return 0.0;

  let [newestData] = priceData;
  let oldestData = priceData[priceData.length - 1];

  // If we don't have enough data, fetch an older data point
  if (priceData.length < 2) {
    const olderData = await fetchPriceData(
      mToken,
      oneMonthAgo,
      sevenDaysAgo,
      1
    );
    if (!olderData.length) return 0.0;
    oldestData = olderData[0];
  }

  const recentPrice = parsePrice(newestData);
  const oldPrice = parsePrice(oldestData);
  const recentTimestamp = Number(newestData.timestamp);
  const oldTimestamp = Number(oldestData.timestamp);

  // Ensure a sufficient time gap for APY calculation
  if ((recentTimestamp - oldTimestamp) / 86400 < 6.5) {
    const olderData = await fetchPriceData(
      mToken,
      oneMonthAgo,
      sevenDaysAgo,
      1
    );
    if (!olderData.length) return 0.0;
    return calculateAPY(
      recentPrice,
      parsePrice(olderData[0]),
      recentTimestamp,
      Number(olderData[0].timestamp)
    );
  }

  return calculateAPY(recentPrice, oldPrice, recentTimestamp, oldTimestamp);
}

module.exports = computeAPY;
