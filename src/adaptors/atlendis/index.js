const { request, gql } = require('graphql-request');

const utils = require('../utils');

const baseUrl = 'https://atlendis.herokuapp.com/graphql';
const urlPolygon = `${baseUrl}/atlendis-hosted-service-polygon`;

const query = gql`
  {
    v1PoolStatuses {
      state
      pool {
        id
        identifier
      }
      normalizedAvailableAmount
      normalizedBorrowedAmount
      adjustedPendingAmount
      weightedAverageLendingRate
    }
  }
`;

const buildPool = (entry) => {
  const APY_TOKEN_DECIMALS = 18;
  const TVL_TOKEN_DECIMALS = 18;

  entry = { ...entry };

  // calculate TVL
  entry.tvl =
    Number(entry.normalizedAvailableAmount) +
    Number(entry.adjustedPendingAmount);

  entry.tvl = entry.tvl / 10 ** TVL_TOKEN_DECIMALS;

  // calculate APY
  entry.apy =
    (100 * Number(entry.weightedAverageLendingRate)) / 10 ** APY_TOKEN_DECIMALS;

  const symbolSplit = entry.pool.identifier.split('-');
  // construct return Object
  const newObj = {
    pool: entry.pool.id,
    chain: utils.formatChain('polygon'),
    project: 'atlendis',
    symbol: symbolSplit[1],
    poolMeta: `${symbolSplit[0]} ${symbolSplit[2]}`,
    tvlUsd: entry.tvl,
    apyBase: entry.apy,
    url: `https://app.atlendis.io/pools/${entry.pool.id}/deposit`,
  };

  return newObj;
};

const main = async () => {
  // pull data
  let data = await request(urlPolygon, query);

  // build pool objects
  data = data.v1PoolStatuses
    .filter((p) => p.state !== 'Closed')
    .map((el) => buildPool(el));

  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
};
