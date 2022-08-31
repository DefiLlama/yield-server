const superagent = require('superagent');
const { request, gql } = require('graphql-request');

const utils = require('../utils');

const url = 'https://api.thegraph.com/subgraphs/name/0xfantommenace';
const subgraphs = {
  fantom: `${url}/granary-fantom`,
  optimism: `${url}/granary-optimism`,
  ethereum: `${url}/granary-ethereum`,
  avalanche: `${url}/granary-avalanche`,
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
        tvlUsd = ((Number(p.availableLiquidity) / `1e${p.decimals}`) * Number(p.price.priceInEth)) / 1e8;

        return {
          pool: p.id,
          chain: utils.formatChain(chainString),
          project: 'the-granary',
          symbol: utils.formatSymbol(p.symbol),
          tvlUsd,
          apyBase: Number(p.liquidityRate) / 1e25,
          underlyingTokens: [p.underlyingAsset],
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
