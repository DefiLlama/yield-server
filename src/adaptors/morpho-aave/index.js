const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');

const utils = require('../utils');

const subgraphMorphoAave = sdk.graph.modifyEndpoint('FKVL7B5yEHvz1GKB9hFpwp64YLN5KXS27aWpQLngyECx');

const SECONDS_PER_YEAR = 3600 * 24 * 365;
const usdcToken = '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48';
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
        eth
        ltv
        isBorrowingEnabled
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
const rateToAPY = (ratePerYear) =>
  Math.pow(1 + ratePerYear / SECONDS_PER_YEAR, SECONDS_PER_YEAR) - 1;

const apy = async () => {
  const data = (await request(subgraphMorphoAave, query)).markets;
  const usdcMarket = data.find((market) => market.token.address === usdcToken);
  // ETH / USDC price used to convert ETH to USD later
  const ethPrice = usdcMarket.reserveData.eth / 1e18;

  return data.map((marketFromGraph) => {
    // supplied amount which is waiting to be matched
    const totalSupplyOnPool =
      (+marketFromGraph.metrics.supplyBalanceOnPool *
        +marketFromGraph.reserveData.supplyPoolIndex) /
      `1e${27 + marketFromGraph.token.decimals}`;

    // supplied amount which is matched p2p
    const totalSupplyP2P =
      (+marketFromGraph.metrics.supplyBalanceInP2P *
        +marketFromGraph.p2pData.p2pSupplyIndex) /
      `1e${27 + marketFromGraph.token.decimals}`;

    // borrowed amount from underlying aave pool
    const totalBorrowOnPool =
      (+marketFromGraph.metrics.borrowBalanceOnPool *
        +marketFromGraph.reserveData.borrowPoolIndex) /
      `1e${27 + marketFromGraph.token.decimals}`;

    // borrowed amount which is matched p2p
    const totalBorrowP2P =
      (+marketFromGraph.metrics.borrowBalanceInP2P *
        +marketFromGraph.p2pData.p2pBorrowIndex) /
      `1e${27 + marketFromGraph.token.decimals}`;

    const totalSupply = totalSupplyOnPool + totalSupplyP2P;
    const totalBorrow = totalBorrowOnPool + totalBorrowP2P;

    // in morpho's case we use total supply as tvl instead of available liq (cause borrow on morhpo can be greater
    // than supply (delta is routed to underlying aave pool)
    const totalSupplyUsd =
      (totalSupply * (marketFromGraph.reserveData.eth / 1e18)) / ethPrice;
    const totalBorrowUsd =
      (totalBorrow * (marketFromGraph.reserveData.eth / 1e18)) / ethPrice;

    // aave base apy's
    const poolSupplyAPY = rateToAPY(
      +marketFromGraph.reserveData.supplyPoolRate / 1e27
    );
    const poolBorrowAPY = rateToAPY(
      +marketFromGraph.reserveData.borrowPoolRate / 1e27
    );

    const spread = poolBorrowAPY - poolSupplyAPY;

    // p2pSupplyAPY = morpho p2p apy
    const p2pIndexCursor = +marketFromGraph.p2pIndexCursor / 1e4;
    const p2pSupplyAPY = poolSupplyAPY + spread * p2pIndexCursor;
    // p2p APY on supply is the same on borrow side
    const p2pBorrowAPY = p2pSupplyAPY;

    // morpho displays both P2P apy and aave apy's on their UI separately. on our end, we use a scaled
    // average of the two values (scaling by matched/unmatched supply & borrow components)
    // eg. if DAI on morhpo has $10mil supplied, but only $10k borrowed, then the avg apy
    // will be very close to the aave apy; reason is that the majority of supplied dai on
    // morpho haven't been matched p2p because of low borrow amount but instead been routed to
    // the underlying aave pool.
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

    return {
      pool: `morpho-aave-${marketFromGraph.token.address}`,
      chain: 'ethereum',
      project: 'morpho-aave',
      symbol: utils.formatSymbol(marketFromGraph.token.symbol),
      apyBase: avgSupplyAPY,
      tvlUsd: totalSupplyUsd,
      underlyingTokens: [marketFromGraph.token.address],
      apyBaseBorrow: avgBorrowAPY,
      totalSupplyUsd: totalSupplyUsd,
      totalBorrowUsd,
      ltv: marketFromGraph.reserveData.ltv / 1e4,
      borrowable: marketFromGraph.reserveData.isBorrowingEnabled,
    };
  });
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://aave.morpho.xyz/?network=mainnet',
};
