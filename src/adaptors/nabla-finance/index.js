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
  hyperliquid:
    'https://api.goldsky.com/api/public/project_cm7aautkjfpbg01v47kya5470/subgraphs/nabla-mainnetAlpha-hyperliquid/v0.0.3/gn',
};

const nablaIndexerUrls = {
  monad:
    'https://indexer.nabla.fi/bsps/0x11B06EF8Adc5ea73841023CB39Be614f471213cc',
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

// Process Nabla indexer response
const getNablaIndexerPoolsMetrics = async (chain) => {
  try {
    const response = await superagent.get(nablaIndexerUrls[chain]);
    const data = response.body;

    if (!data.bsps || data.bsps.length === 0) {
      console.log(`No BSPs found for chain: ${chain}`);
      return [];
    }

    const allPools = [];

    for (const bsp of data.bsps) {
      const coveredPools = bsp.coveredSwapPools || [];

      if (coveredPools.length === 0) continue;

      // Collect all unique token addresses
      const tokens = [...new Set(coveredPools.map((pool) => pool.asset))];

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
        continue;
      }

      for (const pool of coveredPools) {
        const {
          address: poolAddress,
          asset: tokenAddress,
          asset_symbol,
          asset_decimals,
          total_liabilities,
          weekly_apr,
        } = pool;

        const key = getPriceKey(tokenAddress, chain).toLowerCase();
        const priceData = usdPrices[key];

        if (!priceData) {
          console.log(`No price data found for token: ${key}`);
          continue;
        }

        const { price } = priceData;
        const decimals = asset_decimals || 18;

        // Calculate TVL from total_liabilities
        const tvlNormalized = BigNumber(total_liabilities || 0).div(
          10 ** decimals
        );
        const tvlUsd = tvlNormalized.times(price).toNumber();

        // Convert weekly APR to APY (weekly_apr is already in %)
        const aprDecimal = Number(weekly_apr || 0) / 100;
        const apyBase = apr7dToApy(aprDecimal) * 100;

        allPools.push({
          pool: `${poolAddress}-${chain}`,
          chain: utils.formatChain(chain),
          project: 'nabla-finance',
          symbol: utils.formatSymbol(asset_symbol),
          underlyingTokens: [tokenAddress],
          tvlUsd: tvlUsd,
          apyBase: apyBase,
        });
      }
    }

    return allPools;
  } catch (error) {
    console.error(
      `Error fetching pools from Monad indexer for chain ${chain}:`,
      error
    );
    return [];
  }
};

const getGraphPoolsMetrics = async (chain) => {
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
  const graphChains = Object.keys(graphUrls);
  const nablaIndexerChains = Object.keys(nablaIndexerUrls);

  // Fetch from GraphQL subgraphs
  const graphPoolsPromises = graphChains.map((chain) =>
    getGraphPoolsMetrics(chain).catch((error) => {
      console.error(`Failed to fetch pools for chain ${chain}:`, error);
      return [];
    })
  );

  // Fetch from Nabla indexer
  const nablaIndexerPoolsPromises = nablaIndexerChains.map((chain) =>
    getNablaIndexerPoolsMetrics(chain).catch((error) => {
      console.error(
        `Failed to fetch pools from indexer for chain ${chain}:`,
        error
      );
      return [];
    })
  );

  const allPoolsPromises = [
    ...graphPoolsPromises,
    ...nablaIndexerPoolsPromises,
  ];
  const allPools = await Promise.all(allPoolsPromises);
  return allPools.flat();
};

module.exports = {
  timetravel: false,
  apy: poolsOnAllChains,
  url: 'https://app.nabla.fi/pools',
};
