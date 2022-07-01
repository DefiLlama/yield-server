const { request, gql } = require('graphql-request');

const utils = require('../utils');

const API_URL = 'https://api.thegraph.com/subgraphs/name/0xc30/scream';

const query = gql`
  {
    markets {
      id
      underlyingSymbol
      supplyRate
      cash
      underlyingPriceUSD
    }
  }
`;

const getApy = async () => {
  const marketsData = await request(API_URL, query);

  const pools = marketsData.markets.map((market) => ({
    pool: market.id,
    chain: utils.formatChain('fantom'),
    project: 'scream',
    symbol: market.underlyingSymbol,
    tvlUsd: market.underlyingPriceUSD * market.cash,
    apy: Number(market.supplyRate) * 100,
  }));

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
};
