const sdk = require('@defillama/sdk');
const superagent = require('superagent');
const { request, gql } = require('graphql-request');

const utils = require('../utils');

const subgraphs = {
  fantom: sdk.graph.modifyEndpoint(
    '2Hjpy81pbiD8V8pTGHfRCFmb5Gsj2CfFRjJjcdGUZK3q'
  ),
  optimism: sdk.graph.modifyEndpoint(
    '7MwUKrqGbDz7voH87MgwLZ9hq1WLJVgK5fHt8NtKeas4'
  ),
};

const query = gql`
  {
    reserves {
      id
      symbol
      decimals
      liquidityRate
      availableLiquidity
      price {
        priceInEth
      }
      isActive
      underlyingAsset
      variableBorrowRate
      baseLTVasCollateral
      totalDeposits
      totalLiquidity
      totalCurrentVariableDebt
    }
  }
`;

const main = async () => {
  const pools = await Promise.all(
    Object.keys(subgraphs).map(async (chainString) => {
      const data = (
        await request(subgraphs[chainString], query)
      ).reserves.filter((p) => p.isActive);

      return data.map((p) => {
        tvlUsd =
          ((Number(p.availableLiquidity) / `1e${p.decimals}`) *
            Number(p.price.priceInEth)) /
          1e8;

        return {
          pool: p.id,
          chain: utils.formatChain(chainString),
          project: 'granary-finance',
          symbol: utils.formatSymbol(p.symbol),
          tvlUsd,
          apyBase: Number(p.liquidityRate) / 1e25,
          underlyingTokens: [p.underlyingAsset],
          apyBaseBorrow: p.variableBorrowRate / 1e25,
          apyRewardBorrow: 0,
          totalSupplyUsd:
            ((Number(p.totalDeposits) / `1e${p.decimals}`) *
              Number(p.price.priceInEth)) /
            1e8,
          totalBorrowUsd:
            ((Number(p.totalCurrentVariableDebt) / `1e${p.decimals}`) *
              Number(p.price.priceInEth)) /
            1e8,
          ltv: p.baseLTVasCollateral / 10000,
        };
      });
    })
  );

  return pools.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://granary.finance/markets/',
};
