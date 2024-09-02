const sdk = require('@defillama/sdk');
const utils = require('../utils');
const { request, gql } = require('graphql-request');
const dayjs = require('dayjs');

const graphQuery = () => gql`
  {
    bonds(where: { state: active }) {
      id
      createdAt
      collateralTokenAmount
      collateralToken {
        id
        decimals
      }
      clearingPrice
      paymentToken {
        id
        symbol
      }
      maturityDate
      symbol
      auctions {
        id
        minimumBondPrice
      }
    }
  }
`;

const graphUrl = sdk.graph.modifyEndpoint('9MKTb9g59rBG1CNUTrriA6tDdSR8neruGJCP6FjD7SSo');

const defiUrl = 'https://coins.llama.fi/prices/current/';

const poolsFunction = async () => {
  const { bonds } = await request(graphUrl, graphQuery(), {});

  const bondPools = bonds.map(async (bond) => {
    const coinUrl = `ethereum:${bond.collateralToken.id}`;
    const fullUrl = defiUrl + coinUrl;
    const { coins } = await utils.getData(fullUrl);
    const tokenPrice = await coins[coinUrl].price;
    const tokenAmount =
      bond.collateralTokenAmount / 10 ** bond.collateralToken.decimals;

    const tvl = tokenPrice * tokenAmount;

    const date = dayjs.unix(bond.maturityDate);
    const issuanceDate = dayjs.unix(bond.createdAt);
    const yearsUntilMaturity = date.diff(issuanceDate, 'year', true);

    const price = () => {
      if (!bond.clearingPrice) {
        return (bondPrice = bond.auctions[0]?.minimumBondPrice);
      } else {
        return (bondPrice = bond.clearingPrice);
      }
    };

    price();

    return {
      pool: `${bond.id}-ethereum`.toLowerCase(),
      chain: utils.formatChain('ethereum'),
      project: 'arbor-finance',
      symbol: utils.formatSymbol(bond.paymentToken.symbol),
      tvlUsd: tvl,
      apy: ((1 / bondPrice) ** (1 / yearsUntilMaturity) - 1) * 100,
      poolMeta: bond.symbol,
      underlyingTokens: [bond.collateralToken.id],
    };
  });

  return (await Promise.all(bondPools)).filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.arbor.finance/offerings',
};

//npm run test --adapter=arbor-finance
