const { request, gql } = require('graphql-request');

const utils = require('../utils');

const url = 'https://api.thegraph.com/subgraphs/name/euler-xyz/euler-mainnet';

const query = gql`
  {
    assets {
      id
      symbol
      supplyAPY
      borrowAPY
      totalBalancesUsd
      totalBorrowsUsd
      config {
        collateralFactor
      }
    }
  }
`;

const buildPool = (pool, chainString) => {
  const ltv = pool.config?.collateralFactor / 4e9;
  return {
    pool: `${pool.id}-euler`,
    chain: utils.formatChain(chainString),
    project: 'euler',
    symbol: utils.formatSymbol(pool.symbol),
    tvlUsd: (pool.totalBalancesUsd - pool.totalBorrowsUsd) / 1e18,
    apyBase: pool.supplyAPY / 1e25,
    apyBaseBorrow: pool.borrowAPY / 1e25,
    totalSupplyUsd: pool.totalBalancesUsd / 1e18,
    totalBorrowUsd: pool.totalBorrowsUsd / 1e18,
    underlyingTokens: [pool.id],
    ltv: Number.isFinite(ltv) ? ltv : null,
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
  url: 'https://app.euler.finance/',
};
