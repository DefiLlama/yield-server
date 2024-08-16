const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const utils = require('../utils');

const subgraphMorphoCompound = sdk.graph.modifyEndpoint(
  sdk.graph.modifyEndpoint('R7SWGbEtAH11a4PXdtLPiVgWtyKWBkExnST1FVaaFQ8')
);

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

const computeCompRewardsAPY = (marketFromGraph, compPrice, supply) => {
  const poolCompSpeed = supply
    ? +marketFromGraph.reserveData.supplySpeeds / 1e18
    : +marketFromGraph.reserveData.borrowSpeeds / 1e18;
  const compDistributedEachDays =
    (poolCompSpeed * SECONDS_PER_DAY) / apxBlockSpeedInSeconds;

  const price =
    marketFromGraph.reserveData.usd /
    Math.pow(10, 18 * 2 - marketFromGraph.token.decimals);
  const totalPoolUsd = supply
    ? ((marketFromGraph.metrics.totalSupplyOnPool *
        marketFromGraph.reserveData.supplyPoolIndex) /
        Math.pow(10, 18 + marketFromGraph.token.decimals)) *
      price
    : ((marketFromGraph.metrics.totalBorrowOnPool *
        marketFromGraph.reserveData.borrowPoolIndex) /
        Math.pow(10, 18 + marketFromGraph.token.decimals)) *
      price;
  const compRate = (compDistributedEachDays * compPrice) / totalPoolUsd;
  return rateToAPY(compRate);
};

const apy = async () => {
  const data = (await request(subgraphMorphoCompound, query)).markets;
  const compMarket = data.find((market) => market.token.address === compToken);
  const compPrice = compMarket.reserveData.usd / 1e18;

  return data.map((marketFromGraph) => {
    // supplied amount which is waiting to be matched
    const totalSupplyOnPool =
      (+marketFromGraph.metrics.supplyBalanceOnPool *
        +marketFromGraph.reserveData.supplyPoolIndex) /
      `1e${18 + marketFromGraph.token.decimals}`;

    // supplied amount which is matched p2p
    const totalSupplyP2P =
      (+marketFromGraph.metrics.supplyBalanceInP2P *
        +marketFromGraph.p2pData.p2pSupplyIndex) /
      `1e${18 + marketFromGraph.token.decimals}`;

    // borrowed amount from underlying compound pool
    const totalBorrowOnPool =
      (+marketFromGraph.metrics.borrowBalanceOnPool *
        +marketFromGraph.reserveData.borrowPoolIndex) /
      `1e${18 + marketFromGraph.token.decimals}`;

    // borrowed amount which is matched p2p
    const totalBorrowP2P =
      (+marketFromGraph.metrics.borrowBalanceInP2P *
        +marketFromGraph.p2pData.p2pBorrowIndex) /
      `1e${18 + marketFromGraph.token.decimals}`;

    const totalSupply = totalSupplyOnPool + totalSupplyP2P;
    const totalBorrow = totalBorrowOnPool + totalBorrowP2P;

    // in morpho's case we use total supply as tvl instead of available liq (cause borrow on morhpo can be greater
    // than supply (delta is routed to underlying compound pool)
    const totalSupplyUsd =
      totalSupply *
      (marketFromGraph.reserveData.usd /
        `1e${18 * 2 - marketFromGraph.token.decimals}`);
    const totalBorrowUsd =
      totalBorrow *
      (marketFromGraph.reserveData.usd /
        `1e${18 * 2 - marketFromGraph.token.decimals}`);

    // compound base apy's
    // note: using 7200 blocks per day results in larger values
    // compared to what is shown on the UI (but I think thats the correct value)
    const poolSupplyAPY = rateToAPY(
      (+marketFromGraph.reserveData.supplyPoolRate / 1e18) * BLOCKS_PER_DAY
    );
    const poolBorrowAPY = rateToAPY(
      (+marketFromGraph.reserveData.borrowPoolRate / 1e18) * BLOCKS_PER_DAY
    );

    const spread = poolBorrowAPY - poolSupplyAPY;

    // p2pSupplyAPY = morpho p2p apy
    const p2pIndexCursor = +marketFromGraph.p2pIndexCursor / 1e4;
    const p2pSupplyAPY = poolSupplyAPY + spread * p2pIndexCursor;
    // p2p APY on supply is the same on borrow side
    const p2pBorrowAPY = p2pSupplyAPY;

    // morpho displays both P2P apy and compound's apy's on their UI separately. on our end, we use a scaled
    // average of the two values (scaling by matched/unmatched supply & borrow components)
    // eg. if DAI on morhpo has $10mil supplied, but only $10k borrowed, then the avg apy
    // will be very close to the compound apy; reason is that the majority of supplied dai on
    // morpho haven't been matched p2p because of low borrow amount but instead been routed to
    // the underlying compound pool.
    const avgSupplyAPY =
      totalSupply === 0
        ? 0
        : ((totalSupplyOnPool * poolSupplyAPY + totalSupplyP2P * p2pSupplyAPY) *
            100) /
          totalSupply;

    const avgBorrowAPY =
      totalBorrow === 0
        ? 0
        : ((totalBorrowOnPool * poolBorrowAPY + totalBorrowP2P * p2pBorrowAPY) *
            100) /
          totalBorrow;

    // note: compAPY matches the compound base apy, however, the compBorrowAPY doesn't (the values are all lower compared to
    // what compound shows (and what we have too for compound apyRewardBorrow))
    const compAPY = computeCompRewardsAPY(marketFromGraph, compPrice, true);
    const compBorrowAPY = computeCompRewardsAPY(
      marketFromGraph,
      compPrice,
      false
    );

    // Morpho redistributes comp rewards to users on Pool
    const avgCompSupplyAPY =
      totalSupply === 0 ? 0 : (compAPY * totalSupplyOnPool * 100) / totalSupply;

    const avgCompBorrowAPY =
      totalBorrow === 0
        ? 0
        : (compBorrowAPY * totalBorrowOnPool * 100) / totalBorrow;

    // some of the markets on compound have higher apy (base + reward) than the p2p apy
    // on morpho. in such cases -> display the compound rates
    const conditionBase = (poolSupplyAPY + compAPY) * 100 > avgSupplyAPY;
    const apyBase = conditionBase ? poolSupplyAPY * 100 : avgSupplyAPY;

    const conditionBaseBorrow =
      -(-poolBorrowAPY + compBorrowAPY) * 100 < avgBorrowAPY;
    const apyBaseBorrow = conditionBaseBorrow
      ? poolBorrowAPY * 100
      : avgBorrowAPY;

    return {
      pool: `morpho-compound-${marketFromGraph.token.address}`,
      chain: 'ethereum',
      project: 'morpho-compound',
      symbol: utils.formatSymbol(marketFromGraph.token.symbol),
      apyBase,
      apyReward: conditionBase ? compAPY * 100 : null,
      rewardTokens: conditionBase ? [compToken] : null,
      tvlUsd: totalSupplyUsd,
      underlyingTokens: [marketFromGraph.token.address],
      apyBaseBorrow,
      apyRewardBorrow: conditionBaseBorrow ? compBorrowAPY * 100 : null,
      totalSupplyUsd,
      totalBorrowUsd: totalBorrowUsd,
      ltv: marketFromGraph.reserveData.collateralFactor / 1e18,
    };
  });
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://compound.morpho.xyz/?network=mainnet',
};
