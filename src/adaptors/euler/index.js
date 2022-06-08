const { request, gql } = require('graphql-request');

const utils = require('../utils');

const url = 'https://api.thegraph.com/subgraphs/name/euler-xyz/euler-mainnet';

const query = gql`
  {
    assets {
      id
      symbol
      supplyAPY
      totalBalancesUsd
      totalBorrowsUsd
    }
  }
`;

const buildPool = (pool, chainString) => {
  return {
    pool: pool.id,
    chain: utils.formatChain(chainString),
    project: 'euler',
    symbol: utils.formatSymbol(pool.symbol),
    tvlUsd: (pool.totalBalancesUsd - pool.totalBorrowsUsd) / 1e18,
    apy: pool.supplyAPY / 1e25,
  };
};

const topLvl = async (chainString) => {
  const data = await request(url, query);
  // build pool objects
  return data.assets.map((pool) => buildPool(pool, chainString));
};

const main = async () => {
  const data = await Promise.all([topLvl('ethereum')]);

  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
};
