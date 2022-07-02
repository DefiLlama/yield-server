const { request, gql } = require('graphql-request');

const utils = require('../utils');

const baseUrl = 'https://api.thegraph.com/subgraphs/name/atlendis';
const urlPolygon = `${baseUrl}/atlendis-hosted-service-polygon`;

const query = gql`
{
  poolStatuses {
    state
    pool {
      id
      identifier
      parameters {
      	underlyingToken
    	}
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
  entry.tvl = Number(entry.normalizedAvailableAmount) + 
              Number(entry.normalizedBorrowedAmount) + 
              Number(entry.adjustedPendingAmount);

  entry.tvl = entry.tvl / 10 ** TVL_TOKEN_DECIMALS;

  // calculate APY
  entry.apy = 100 * Number(entry.weightedAverageLendingRate) / 10 ** APY_TOKEN_DECIMALS;

  // construct return Object
  const newObj = {
    pool: entry.pool.id,
    chain: utils.formatChain('polygon'),
    project: 'atlendis',
    symbol: utils.formatSymbol(entry.pool.identifier),
    tvlUsd: entry.tvl,
    apy: entry.apy
  }

  return newObj
}

const main = async () => {
  // pull data
  data = await request(urlPolygon, query);

  // build pool objects
  data = data.poolStatuses.map((el) => buildPool(el));

  return data
}

module.exports = {
  timetravel: false,
  apy: main
}