const { request, gql } = require('graphql-request');

const utils = require('../utils');

const subgraphMorphoCompound =
  'https://api.thegraph.com/subgraphs/name/morpho-labs/morphocompoundmainnet';

const BLOCKS_PER_DAY = 6_570;
const query = gql`
  query GetYieldsData {
    markets(first: 128) {
      address
      p2pIndexCursor
      reserveData {
        borrowPoolIndex
        supplyPoolIndex
        borrowPoolRate
        supplyPoolRate
        usd
      }
      p2pData {
        p2pSupplyIndex
        p2pBorrowIndex
      }
      token {
        address
        decimals
        symbol
      }
      metrics {
        borrowBalanceOnPool
        supplyBalanceOnPool
        borrowBalanceInP2P
        supplyBalanceInP2P
      }
    }
  }
`;
const rateToAPY = (rate) => Math.pow(1 + BLOCKS_PER_DAY * rate, 365) - 1;
const main = async () => {
  const data = (await request(subgraphMorphoCompound, query)).markets;
  return data.map((marketFromGraph) => {
    const totalSupplyOnPool =
      (+marketFromGraph.metrics.supplyBalanceOnPool *
        +marketFromGraph.reserveData.supplyPoolIndex) /
      `1e${18 + marketFromGraph.token.decimals}`;
    const totalSupplyP2P =
      (+marketFromGraph.metrics.supplyBalanceInP2P *
        +marketFromGraph.p2pData.p2pSupplyIndex) /
      `1e${18 + marketFromGraph.token.decimals}`;
    const totalSupply = totalSupplyOnPool + totalSupplyP2P;
    const totalSupplyUSD =
      totalSupply *
      (marketFromGraph.reserveData.usd /
        `1e${18 * 2 - marketFromGraph.token.decimals}`);
    const totalBorrowOnPool =
      (+marketFromGraph.metrics.borrowBalanceOnPool *
        +marketFromGraph.reserveData.borrowPoolIndex) /
      `1e${18 + marketFromGraph.token.decimals}`;
    const totalBorrowP2P =
      (+marketFromGraph.metrics.borrowBalanceInP2P *
        +marketFromGraph.p2pData.p2pBorrowIndex) /
      `1e${18 + marketFromGraph.token.decimals}`;
    const totalBorrow = totalBorrowOnPool + totalBorrowP2P;
    const totalBorrowUSD =
      totalBorrow *
      (marketFromGraph.reserveData.usd /
        `1e${18 * 2 - marketFromGraph.token.decimals}`);
    const tvlUsd = totalSupplyUSD - totalBorrowUSD;

    const poolSupplyRate = +marketFromGraph.reserveData.supplyPoolRate;
    const poolBorrowRate = +marketFromGraph.reserveData.borrowPoolRate;

    const p2pIndexCursor = +marketFromGraph.p2pIndexCursor / 1e4;
    const spread = poolBorrowRate - poolSupplyRate;
    const p2pSupplyRate = poolSupplyRate + (spread * p2pIndexCursor) / 1e18;
    const poolSupplyAPY = rateToAPY(poolSupplyRate / 1e18);
    const p2pSupplyAPY = rateToAPY(p2pSupplyRate / 1e18);
    const avgSupplyAPY =
      (totalSupplyOnPool * poolSupplyAPY + totalSupplyP2P * p2pSupplyAPY) /
      totalSupply;
    return {
      pool: `morpho-compound-${marketFromGraph.token.address}`,
      chain: 'ethereum',
      project: 'morpho',
      symbol: utils.formatSymbol(marketFromGraph.token.symbol),
      apyBase: avgSupplyAPY * 100,
      tvlUsd,
      underlyingTokens: [marketFromGraph.token.address],
    };
  });
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.morpho.xyz',
};
