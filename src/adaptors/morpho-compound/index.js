const { request, gql } = require('graphql-request');

const utils = require('../utils');

const subgraphMorphoCompound =
  'https://api.thegraph.com/subgraphs/name/morpho-labs/morphocompoundmainnet';

const BLOCKS_PER_DAY = 7200;
const SECONDS_PER_DAY = 3600 * 24;
const apxBlockSpeedInSeconds = 12; // in 1e4 units
const compToken = '0xc00e94cb662c3520282e6f5717214004a7f26888'.toLowerCase();
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
        supplySpeeds
        borrowSpeeds
        usd
        collateralFactor
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
        totalSupplyOnPool
        totalBorrowOnPool
      }
    }
  }
`;
const rateToAPY = (rate) => Math.pow(1 + rate, 365) - 1;

const computeCompRewardsAPY = (marketFromGraph, compPrice) => {
  const poolSupplyCompSpeed = +marketFromGraph.reserveData.borrowSpeeds / 1e18;
  const compDistributedEachDays =
    (poolSupplyCompSpeed * SECONDS_PER_DAY) / apxBlockSpeedInSeconds;

  const price =
    marketFromGraph.reserveData.usd /
    Math.pow(10, 18 * 2 - marketFromGraph.token.decimals);
  const totalPoolSupplyUsd =
    ((marketFromGraph.metrics.totalSupplyOnPool *
      marketFromGraph.reserveData.supplyPoolIndex) /
      Math.pow(10, 18 + marketFromGraph.token.decimals)) *
    price;
  const compRate = (compDistributedEachDays * compPrice) / totalPoolSupplyUsd;
  return rateToAPY(compRate);
};

const computeCompBorrowRewardsAPY = (marketFromGraph, compPrice) => {
  const poolSupplyCompSpeed = +marketFromGraph.reserveData.supplySpeeds / 1e18;
  const compDistributedEachDays =
    (poolSupplyCompSpeed * SECONDS_PER_DAY) / apxBlockSpeedInSeconds;

  const price =
    marketFromGraph.reserveData.usd /
    Math.pow(10, 18 * 2 - marketFromGraph.token.decimals);
  const totalBorrowPoolUsd =
    ((marketFromGraph.metrics.totalBorrowOnPool *
      marketFromGraph.reserveData.borrowPoolIndex) /
      Math.pow(10, 18 + marketFromGraph.token.decimals)) *
    price;
  const compRate = (compDistributedEachDays * compPrice) / totalBorrowPoolUsd;
  return rateToAPY(compRate);
};

const main = async () => {
  const data = (await request(subgraphMorphoCompound, query)).markets;
  const compMarket = data.find((market) => market.token.address === compToken);
  const compPrice = compMarket.reserveData.usd / 1e18;
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
    const totalBorrow =
      (+marketFromGraph.metrics.borrowBalanceOnPool *
        +marketFromGraph.reserveData.borrowPoolIndex +
        +marketFromGraph.metrics.borrowBalanceInP2P *
          +marketFromGraph.p2pData.p2pBorrowIndex) /
      `1e${18 + marketFromGraph.token.decimals}`;
    const tvlUsd =
      totalSupply *
      (marketFromGraph.reserveData.usd /
        `1e${18 * 2 - marketFromGraph.token.decimals}`);
    const tvlBorrow =
      totalBorrow *
      (marketFromGraph.reserveData.usd /
        `1e${18 * 2 - marketFromGraph.token.decimals}`);
    const poolSupplyRate = +marketFromGraph.reserveData.supplyPoolRate;
    const poolBorrowRate = +marketFromGraph.reserveData.borrowPoolRate;

    const p2pIndexCursor = +marketFromGraph.p2pIndexCursor / 1e4;
    const poolSupplyAPY = rateToAPY((poolSupplyRate / 1e18) * BLOCKS_PER_DAY);
    const poolBorrowAPY = rateToAPY((poolBorrowRate / 1e18) * BLOCKS_PER_DAY);

    const spread = poolBorrowAPY - poolSupplyAPY;
    const p2pSupplyAPY = poolSupplyAPY + spread * p2pIndexCursor;
    const avgSupplyAPY =
      totalSupply === 0
        ? 0
        : (totalSupplyOnPool * poolSupplyAPY + totalSupplyP2P * p2pSupplyAPY) /
          totalSupply;
    const compAPY = computeCompRewardsAPY(marketFromGraph, compPrice);
    const compBorrowAPY = computeCompBorrowRewardsAPY(
      marketFromGraph,
      compPrice
    );

    const avgCompSupplyAPY =
      totalSupply === 0 ? 0 : (compAPY * totalSupplyOnPool) / totalSupply; // Morpho redistributes comp rewards to users on Pool

    const morphoRewards = 0; // MORPHO token is not transferable for now,
    // but distributed to suppliers. SO that's why I set the APY to 0,
    // to display the MORPHO token, but without an explicit APY
    return {
      pool: `morpho-compound-${marketFromGraph.token.address}`,
      chain: 'ethereum',
      project: 'morpho-compound',
      symbol: utils.formatSymbol(marketFromGraph.token.symbol),
      apyBase: avgSupplyAPY * 100,
      apyReward: avgCompSupplyAPY * 100,
      rewardTokens: [compToken, '0x9994e35db50125e0df82e4c2dde62496ce330999'],
      tvlUsd,
      underlyingTokens: [marketFromGraph.token.address],
      apyBaseBorrow: poolBorrowAPY * 100,
      apyRewardBorrow: compBorrowAPY * 100,
      totalSupplyUsd: tvlUsd,
      totalBorrowUsd: tvlBorrow,
      ltv: marketFromGraph.reserveData.collateralFactor / 1e18,
    };
  });
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.morpho.xyz',
};
