const utils = require('../utils');
const { request, gql } = require('graphql-request');
const dayjs = require('dayjs');
const { util, api } = require('@defillama/sdk');

const graphQuery = () => gql`
  {
    bonds(where: { state: active }) {
      id
      collateralTokenAmount
      collateralToken {
        id
        decimals
      }
      clearingPrice
      maturityDate
      symbol
      auctions {
        id
        minimumBondPrice
      }
    }
  }
`;

//Full list of bids; iterate over each bid (increment until gt max offering size); bid object will have price

const graphUrl =
  'https://api.thegraph.com/subgraphs/name/alwaysbegrowing/arbor-v1';

const poolsFunction = async () => {
  const { bonds } = await request(graphUrl, graphQuery(), {});

  const bondPools = bonds.map(async (bond) => {
    const usdTvl = {};
    const token = bond.collateralToken.id;
    const transform = await transformAddress();
    const tvl = await api.abi.call({
      abi: 'erc20:balanceOf',
      chain: 'ethereum',
      target: bond.collateralToken.id, //FOX token
      params: bond.id, //Bond id
    });

    //   bond.collateralTokenAmount / 10 ** bond.collateralToken.decimals;

    console.log(usdTvl, token, tvl.output);

    await util.sumSingleBalance(
      usdTvl,
      `0xc2132d05d31c914a87c6611c10748aeb04b58e8f`,
      tvl.output
    );

    console.log(usdTvl);

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
      pool: `${bond.id}-ethereum`.toLowerCase(),
      chain: utils.formatChain('ethereum'),
      project: 'arbor-finance',
      symbol: utils.formatSymbol(bond.symbol),
      tvlUsd: bond.collateralTokenAmount / 10 ** bond.collateralToken.decimals,
      apy: (1 / bondPrice) ** (1 / yearsUntilMaturity) - 1,
    };
  });

  return bondPools; // Anchor only has a single pool with APY
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.arbor.finance/offerings',
};
