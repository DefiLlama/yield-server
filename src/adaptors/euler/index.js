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
      decimals
    }
  }
`;

const main = async () => {
  const data = await request(url, query);

  const pools = data.assets.map((pool) => {
    const ltv = pool.config?.collateralFactor / 4e9;
    const totalSupplyUsd = pool.totalBalancesUsd / `1e${pool.decimals}`;
    const totalBorrowUsd = pool.totalBorrowsUsd / `1e${pool.decimals}`;

    return {
      pool: `${pool.id}-euler`,
      chain: 'Ethereum',
      project: 'euler',
      symbol: utils.formatSymbol(pool.symbol),
      tvlUsd: totalSupplyUsd - totalBorrowUsd,
      apyBase: pool.supplyAPY / 1e25,
      apyBaseBorrow: pool.borrowAPY / 1e25,
      totalSupplyUsd,
      totalBorrowUsd,
      underlyingTokens: [pool.id],
      ltv: Number.isFinite(ltv) ? ltv : null,
      url: `https://app.euler.finance/market/${pool.id}`,
    };
  });

  return pools;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.euler.finance/',
};
