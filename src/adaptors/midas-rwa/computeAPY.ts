const { request } = require('graphql-request');

const GRAPH_URL =
  'https://subgraph.satsuma-prod.com/3e11c7846b93/midas--174381/midas-main-public/api';

async function computeAPY(mtoken) {
  const now = Math.floor(Date.now() / 1000);
  const oneYearAgo = now - 365 * 24 * 60 * 60;

  const query = `
    query GetAnswers($mToken: Bytes, $timestampFrom: BigInt, $timestampTo: BigInt) {
      dataFeedAnswers(
        orderBy: timestamp
        orderDirection: desc
        where: {
          timestamp_gte: $timestampFrom
          timestamp_lte: $timestampTo
          mToken: $mToken
        }
      ) {
        feed
        mToken
        timestamp
        answer
        decimals
      }
    }
  `;

  const response = await request(GRAPH_URL, query, {
    mToken: mtoken,
    timestampFrom: +oneYearAgo,
    timestampTo: +now,
  });
  const data = response.dataFeedAnswers;

  const mostRecent = data[0];
  const oldest = data[data.length - 1];

  const decimals = parseInt(mostRecent.decimals);
  const firstValue = parseInt(mostRecent.answer) / Math.pow(10, decimals);
  const lastValue = parseInt(oldest.answer) / Math.pow(10, decimals);

  const firstTimestamp = parseInt(mostRecent.timestamp);
  const lastTimestamp = parseInt(oldest.timestamp);
  const daysDifference = (firstTimestamp - lastTimestamp) / 86400;

  if (daysDifference <= 0 || lastValue === 0) {
    console.error(
      'Invalid data: daysDifference must be > 0 and lastValue must be nonzero.'
    );
    return null;
  }

  const rate = firstValue / lastValue;
  const annualized = Math.pow(rate, 365 / daysDifference) - 1;

  return Number((annualized * 100).toFixed(2));
}

module.exports = computeAPY;
