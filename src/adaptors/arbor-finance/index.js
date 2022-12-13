const utils = require('../utils');
const { request, gql } = require('graphql-request');
const dayjs = require('dayjs');

const graphQuery = () => gql`
  {
    bonds(where: { state: active }) {
      id
      collateralTokenAmount
      collateralToken {
        decimals
      }
      clearingPrice
      maturityDate
      symbol
      auctions {
        minimumBondPrice
      }
    }
  }
`;

const graphUrl =
  'https://api.thegraph.com/subgraphs/name/alwaysbegrowing/arbor-v1';

const poolsFunction = async () => {
  const { bonds } = await request(graphUrl, graphQuery(), {});

  const bondPools = bonds.map((bond) => {
    const date = dayjs.unix(bond.maturityDate);
    const currentDate = dayjs(new Date());
    const yearsUntilMaturity = date.diff(currentDate, 'year', true);

    const price = () => {
      if (!bond.clearingPrice) {
        return (bondPrice = bond.auctions[0].minimumBondPrice);
      } else {
        return (bondPrice = bond.clearingPrice);
      }
    };

    price();

    return {
      pool: `${bond.id}-ethereum`,
      chain: utils.formatChain('ethereum'),
      project: 'arbor-finance',
      symbol: utils.formatSymbol(bond.symbol),
      tvlUsd: Number(
        bond.collateralTokenAmount / 10 ** bond.collateralToken.decimals
      ),
      apy: Number((1 / bondPrice) ** (1 / yearsUntilMaturity) - 1),
    };
  });

  return [bondPools]; // Anchor only has a single pool with APY
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.arbor.finance/offerings',
};
