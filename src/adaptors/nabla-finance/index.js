
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const superagent = require('superagent');
const { request, gql } = require('graphql-request');


const WEEKS_IN_YEAR = 52.142;

const graphUrls = {
  arbitrum: "https://subgraph.satsuma-prod.com/9b84d9926bf3/nabla-finance--3958960/nabla-mainnetAlpha/api",
  base: "https://subgraph.satsuma-prod.com/9b84d9926bf3/nabla-finance--3958960/nabla-mainnetAlpha-base/api",
}

const query = gql`
  query getSwapPools {
    swapPools {
      id
			liabilities
      apr7d
      token {
        id
      }
    }
  }
`

const getPriceKey = (address, chain) => `${chain}:${address}`;

const apr7dToApy = (apr) => {
  const aprDay = apr / 365;
  return ((1 + aprDay) ** 365) - 1;
};


const poolsFunction = async (chain) => {
  
  const swapPools = (await request(graphUrls[chain], query)).swapPools;
  
  const tokens = swapPools.map((p) => p.token.id);

  const priceKeys = [...new Set(tokens)].map(
    (address) => getPriceKey(address, chain)
  );
  const usdPrices = ( await superagent.get(
    `https://coins.llama.fi/prices/current/${priceKeys
      .join(',')
      .toLowerCase()}`
    )
  ).body.coins;

  return swapPools.map((swapPool, i) => {
    const {      
      id: pool,
			liabilities: tvl,
      apr7d,
      token
    } = swapPool;
    const tokenAddress = token.id;

    const key = getPriceKey(tokenAddress, chain);
    const {decimals, symbol, price} = usdPrices[key];
  
    return  {
      pool: `${pool}-${chain}`,
      chain: utils.formatChain(chain),
      project: "nabla-finance",
      symbol: utils.formatSymbol(symbol),
      underlyingTokens: [tokenAddress],
      tvlUsd: (BigNumber(tvl)/(10**decimals) * price), 
      apyBase: apr7dToApy(apr7d/(10**decimals)) * 100,
    };
  });
};

const poolsOnAllChains = async () => {
  const chains = Object.keys(graphUrls)
  
  const allPools = await Promise.all(chains.map(chain => poolsFunction(chain)));

  return allPools.flat();
}

module.exports = {
  timetravel: false,
  apy: poolsOnAllChains,
  url: 'https://app.nabla.fi/pools',
};