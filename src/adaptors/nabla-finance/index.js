const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const superagent = require('superagent');
const { request, gql } = require('graphql-request');

const WEEKS_IN_YEAR = 52.142;

const graphUrls = {
  arbitrum:
    'https://subgraph.satsuma-prod.com/9b84d9926bf3/nabla-finance--3958960/nabla-mainnetAlpha-arbitrum/api',
  base: 'https://subgraph.satsuma-prod.com/9b84d9926bf3/nabla-finance--3958960/nabla-mainnetAlpha-base/api',
  berachain:
    'https://subgraph.satsuma-prod.com/9b84d9926bf3/nabla-finance--3958960/nabla-mainnetAlpha-berachain-public/api',
};

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
`;

const getPriceKey = (address, chain) => `${chain}:${address}`;

const apr7dToApy = (apr) => {
  const aprDay = apr / 365;
  return (1 + aprDay) ** 365 - 1;
};

const poolsFunction = async (chain) => {
  try {
    const swapPools = (await request(graphUrls[chain], query)).swapPools;

    if (!swapPools || swapPools.length === 0) {
      console.log(`No swap pools found for chain: ${chain}`);
      return [];
    }

    const tokens = swapPools.map((p) => p.token.id);

    const priceKeys = [...new Set(tokens)].map((address) =>
      getPriceKey(address, chain)
    );

    const priceResponse = await superagent.get(
      `https://coins.llama.fi/prices/current/${priceKeys
        .join(',')
        .toLowerCase()}`
    );

    const usdPrices = priceResponse.body.coins || {};

    return swapPools
      .map((swapPool) => {
        const { id: pool, liabilities: tvl, apr7d, token } = swapPool;
        const tokenAddress = token.id;

        const key = getPriceKey(tokenAddress, chain).toLowerCase();
        const priceData = usdPrices[key];

        if (!priceData) {
          console.log(`No price data found for token: ${key}`);
          return null;
        }

        const { decimals, symbol, price } = priceData;

        return {
          pool: `${pool}-${chain}`,
          chain: utils.formatChain(chain),
          project: 'nabla-finance',
          symbol: utils.formatSymbol(symbol),
          underlyingTokens: [tokenAddress],
          tvlUsd: (BigNumber(tvl) / 10 ** decimals) * price,
          apyBase: apr7dToApy(apr7d / 10 ** decimals) * 100,
        };
      })
      .filter(Boolean);
  } catch (error) {
    console.error(`Error fetching pools for chain ${chain}:`, error);
    return [];
  }
};

const poolsOnAllChains = async () => {
  const chains = Object.keys(graphUrls);

  const allPoolsPromises = chains.map((chain) =>
    poolsFunction(chain).catch((error) => {
      console.error(`Failed to fetch pools for chain ${chain}:`, error);
      return [];
    })
  );

  const allPools = await Promise.all(allPoolsPromises);
  return allPools.flat();
};

module.exports = {
  timetravel: false,
  apy: poolsOnAllChains,
  url: 'https://app.nabla.fi/pools',
};
