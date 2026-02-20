const utils = require('../utils');
const axios = require('axios');
const sdk = require('@defillama/sdk');

const API_KEY = '9985778c880fe83f15135345e0726f4bd33e728c';
const CHAINS = ['ethereum', 'bsc', 'arbitrum', 'base'];

// Chain ID mapping for URLs
const CHAIN_IDS = {
  ethereum: 1,
  bsc: 56,
  arbitrum: 42161,
  base: 8453,
};

// ABI for totalUnderlying function
const totalUnderlyingABI = {
  constant: true,
  inputs: [],
  name: 'totalUnderlying',
  outputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
  payable: false,
  stateMutability: 'view',
  type: 'function',
};

/**
 * Fetch APY data from Native API for a specific chain
 */
const fetchApyData = async (chain) => {
  try {
    const response = await axios.get(
      `https://v2.api.native.org/swap-api-v2/v2/lend/historical-apy?chain=${chain}`,
      {
        headers: {
          apiKey: API_KEY,
        },
      }
    );
    // Ensure we always return an array
    const data = response.data;
    if (!Array.isArray(data)) {
      console.warn(
        `API returned non-array data for ${chain}:`,
        typeof data,
        data
      );
      return [];
    }
    return data;
  } catch (error) {
    console.error(
      `Error fetching APY data for ${chain}:`,
      error.message,
      error.response?.status,
      error.response?.data
    );
    return [];
  }
};

/**
 * Batch fetch total underlying amounts for all LP tokens on a chain
 */
const batchFetchTotalUnderlying = async (lpTokenAddresses, chain) => {
  if (lpTokenAddresses.length === 0) return {};

  try {
    const results = await sdk.api.abi.multiCall({
      calls: lpTokenAddresses.map((address) => ({ target: address })),
      abi: totalUnderlyingABI,
      chain: chain,
      permitFailure: true,
    });

    const tvlMap = {};
    results.output.forEach((result, index) => {
      const address = lpTokenAddresses[index].toLowerCase();
      tvlMap[address] = result.output ? BigInt(result.output) : BigInt(0);
    });

    return tvlMap;
  } catch (error) {
    console.error(
      `Error batch fetching totalUnderlying for ${chain}:`,
      error.message
    );
    return {};
  }
};

/**
 * Batch fetch token symbols and decimals for all tokens on a chain
 */
const batchFetchTokenInfo = async (tokenAddresses, chain) => {
  if (tokenAddresses.length === 0) return {};

  try {
    const [symbolResults, decimalsResults] = await Promise.all([
      sdk.api.abi.multiCall({
        calls: tokenAddresses.map((address) => ({ target: address })),
        abi: 'erc20:symbol',
        chain: chain,
        requery: true,
        permitFailure: true,
      }),
      sdk.api.abi.multiCall({
        calls: tokenAddresses.map((address) => ({ target: address })),
        abi: 'erc20:decimals',
        chain: chain,
        requery: true,
        permitFailure: true,
      }),
    ]);

    const tokenInfoMap = {};
    tokenAddresses.forEach((address, index) => {
      const addr = address.toLowerCase();
      tokenInfoMap[addr] = {
        symbol:
          symbolResults.output[index]?.output || 'UNKNOWN',
        decimals: decimalsResults.output[index]?.output || 18,
      };
    });

    return tokenInfoMap;
  } catch (error) {
    console.error(`Error batch fetching token info for ${chain}:`, error.message);
    return {};
  }
};

/**
 * Batch fetch token prices from DefiLlama
 * Chunks requests to avoid API limits (max 100 tokens per request)
 */
const batchFetchTokenPrices = async (tokenAddresses, chain) => {
  if (tokenAddresses.length === 0) return {};

  const MAX_TOKENS_PER_REQUEST = 100;
  const pricesMap = {};

  try {
    // Chunk token addresses into batches
    for (let i = 0; i < tokenAddresses.length; i += MAX_TOKENS_PER_REQUEST) {
      const batch = tokenAddresses.slice(i, i + MAX_TOKENS_PER_REQUEST);
      const priceKeys = batch
        .map((addr) => `${chain}:${addr}`.toLowerCase())
        .join(',');

      const response = await axios.get(
        `https://coins.llama.fi/prices/current/${priceKeys}`
      );

      batch.forEach((address) => {
        const priceKey = `${chain}:${address}`.toLowerCase();
        const priceData = response.data?.coins?.[priceKey];
        pricesMap[address.toLowerCase()] = priceData?.price || 0;
      });
    }

    return pricesMap;
  } catch (error) {
    console.error(
      `Error batch fetching prices for ${chain}:`,
      error.message
    );
    return pricesMap;
  }
};

/**
 * Calculate TVL in USD
 */
const calculateTvlUsd = (totalUnderlying, decimals, price) => {
  const totalUnderlyingDecimal = Number(totalUnderlying) / 10 ** decimals;
  return totalUnderlyingDecimal * price;
};

/**
 * Main function to fetch all pools
 */
const apy = async () => {
  const pools = [];

  // Fetch APY data for all chains in parallel
  const apyDataPromises = CHAINS.map((chain) => fetchApyData(chain));
  const apyDataResults = await Promise.all(apyDataPromises);

  // Process each chain's data
  for (let chainIndex = 0; chainIndex < CHAINS.length; chainIndex++) {
    const chain = CHAINS[chainIndex];
    const apyData = apyDataResults[chainIndex];

    // Ensure apyData is an array
    if (!Array.isArray(apyData) || apyData.length === 0) {
      console.warn(`No APY data found for chain: ${chain}`);
      continue;
    }

    // Filter valid pools and collect unique addresses
    const validPools = apyData.filter(
      (pool) => pool.lpTokenAddress && pool.address
    );

    if (validPools.length === 0) {
      continue;
    }

    // Collect unique addresses for batching
    const lpTokenAddresses = [
      ...new Set(validPools.map((p) => p.lpTokenAddress.toLowerCase())),
    ];
    const underlyingTokenAddresses = [
      ...new Set(validPools.map((p) => p.address.toLowerCase())),
    ];

    // Batch fetch all data for this chain
    const [tvlMap, tokenInfoMap, pricesMap] = await Promise.all([
      batchFetchTotalUnderlying(lpTokenAddresses, chain),
      batchFetchTokenInfo(underlyingTokenAddresses, chain),
      batchFetchTokenPrices(underlyingTokenAddresses, chain),
    ]);

    // Process each pool using the batched data
    for (const poolData of validPools) {
      try {
        const { address, lpTokenAddress, fundingAPY } = poolData;
        const lpAddr = lpTokenAddress.toLowerCase();
        const underlyingAddr = address.toLowerCase();

        // Get data from batched results
        const totalUnderlying = tvlMap[lpAddr] || BigInt(0);
        const tokenInfo = tokenInfoMap[underlyingAddr] || {
          symbol: 'UNKNOWN',
          decimals: 18,
        };
        const tokenPrice = pricesMap[underlyingAddr] || 0;

        // Calculate TVL
        const tvlUsd = calculateTvlUsd(
          totalUnderlying,
          tokenInfo.decimals,
          tokenPrice
        );

        // Skip pools with zero or invalid TVL
        if (!tvlUsd || tvlUsd <= 0 || !Number.isFinite(tvlUsd)) {
          continue;
        }

        // Format symbol with 'n' prefix
        const symbol = `n${utils.formatSymbol(tokenInfo.symbol)}`;

        // Format pool identifier
        const poolId = `${lpAddr}-${chain}`;

        // Format chain name
        const formattedChain = utils.formatChain(chain);

        // Get chain ID and underlying ticker for URL
        const chainId = CHAIN_IDS[chain];
        const underlyingTicker = utils.formatSymbol(tokenInfo.symbol);

        // Build individual pool URL
        const poolUrl = `https://native.org/app/credit-pool/?chainId=${chainId}&action=deposit&token0=${underlyingTicker}`;

        pools.push({
          pool: poolId,
          chain: formattedChain,
          project: 'native-credit-pool',
          symbol: symbol,
          tvlUsd: tvlUsd,
          apyBase: fundingAPY || 0,
          underlyingTokens: [underlyingAddr],
          poolMeta: 'single-side, no-loss LP',
          url: poolUrl,
        });
      } catch (error) {
        console.error(
          `Error processing pool on ${chain}:`,
          error.message,
          poolData
        );
      }
    }
  }

  // Final filter to ensure no pools with zero or invalid TVL
  return pools.filter((pool) => pool.tvlUsd > 0 && Number.isFinite(pool.tvlUsd));
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://native.org',
};

