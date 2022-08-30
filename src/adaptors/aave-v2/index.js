const superagent = require('superagent');
const { request, gql } = require('graphql-request');

const utils = require('../utils');

const url = 'https://api.thegraph.com/subgraphs/name/aave';
const subgraphs = {
  ethereum: `${url}/protocol-v2`,
  polygon: `${url}/aave-v2-matic`,
  avalanche: `${url}/protocol-v2-avalanche`,
};

const query = gql`
  {
    reserves {
      symbol
      decimals
      liquidityRate
      availableLiquidity
      price {
        priceInEth
      }
      isActive
      underlyingAsset
      aToken {
        id
      }
    }
  }
`;

const main = async () => {
  // get eth usd price
  const key = 'ethereum:0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2';
  const ethPriceUSD = (
    await superagent.post('https://coins.llama.fi/prices').send({
      coins: [key],
    })
  ).body.coins[key].price;

  const pools = await Promise.all(
    Object.keys(subgraphs).map(async (chainString) => {
      const data = (
        await request(subgraphs[chainString], query)
      ).reserves.filter((p) => p.isActive);

      return data.map((p) => {
        tvlUsd =
          chainString !== 'avalanche'
            ? (((Number(p.availableLiquidity) / `1e${p.decimals}`) *
                Number(p.price.priceInEth)) /
                1e18) *
              ethPriceUSD
            : // priceInEth is the chainlink usd price for avalanche subgraph with different decimals
              ((Number(p.availableLiquidity) / `1e${p.decimals}`) *
                Number(p.price.priceInEth)) /
              1e8;

        return {
          pool: `${p.aToken.id}-${chainString}`.toLowerCase(),
          chain: utils.formatChain(chainString),
          project: 'aave-v2',
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
  url: 'https://app.aave.com/markets/',
};
