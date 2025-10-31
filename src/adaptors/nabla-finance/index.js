const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const superagent = require('superagent');
const { request, gql } = require('graphql-request');

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

// APR → APY conversion (7-day APR assumed, converted to daily then compounded yearly)
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

    const tokens = [...new Set(swapPools.map((swapPool) => swapPool.token.id))];

    const priceKeys = tokens.map((address) => getPriceKey(address, chain));

    let usdPrices = {};
    try {
      const priceResponse = await superagent.get(
        `https://coins.llama.fi/prices/current/${priceKeys
          .join(',')
          .toLowerCase()}`
      );
      usdPrices = priceResponse.body.coins || {};
    } catch (err) {
      console.error(`Failed fetching prices for chain ${chain}:`, err);
      return [];
    }

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

        const tvlNormalized = BigNumber(tvl).div(10 ** (decimals || 18));
        const tvlUsd = tvlNormalized.times(price).toNumber();

        const aprNormalized = Number(apr7d || 0) / 10 ** (decimals || 18);
        const apyBase = apr7dToApy(aprNormalized) * 100;

        return {
          pool: `${pool}-${chain}`,
          chain: utils.formatChain(chain),
          project: 'nabla-finance',
          symbol: utils.formatSymbol(symbol),
          underlyingTokens: [tokenAddress],
          tvlUsd: tvlUsd,
          apyBase: apyBase,
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
