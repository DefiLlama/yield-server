// GT3 Finance specific utilities
const utils = require('../utils');

// Use superagent as fetch fallback if fetch is not available
let fetch;
try {
  fetch = globalThis.fetch;
} catch (e) {
  const superagent = require('superagent');
  fetch = async (url, options) => {
    const response = await superagent
      .post(url)
      .set(options.headers)
      .send(JSON.parse(options.body));
    return {
      ok: response.status < 400,
      status: response.status,
      json: async () => response.body
    };
  };
}

// API configuration
const GRAPHQL_ENDPOINT = 'https://backend.gt3.finance/graphql';
const PROJECT_KEY = 'GT3';

const REQUEST_HEADERS = {
  'accept': '*/*',
  'content-type': 'application/json',
  'origin': 'https://dapp.gt3.finance',
  'referer': 'https://dapp.gt3.finance/',
  'x-project-key': PROJECT_KEY,
  'user-agent': 'Mozilla/5.0 (compatible; DeFiLlama/1.0)'
};

// Chain ID to chain name mapping for DeFiLlama
const CHAIN_MAPPING = {
  1: 'ethereum',
  56: 'binance',
  137: 'polygon',
  42161: 'arbitrum',
  10: 'optimism',
  8453: 'base',
  43114: 'avalanche',
  250: 'fantom',
  100: 'gnosis',
  324: 'era',
  59144: 'linea',
  534352: 'scroll'
};

/**
 * Make GraphQL requests using fetch
 * @param {Object} query - GraphQL query to execute
 * @returns {Promise<Object>} - API response
 */
const makeGraphQLRequest = async (query) => {
  try {
    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: REQUEST_HEADERS,
      body: JSON.stringify([query])
    });

    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    
    if (!data || !Array.isArray(data) || data.length === 0) {
      throw new Error('Invalid response format');
    }

    return data[0];
  } catch (error) {
    console.error('Error making GraphQL request:', error);
    throw new Error(`GraphQL request failed: ${error.message}`);
  }
};

/**
 * Get formatted chain name for DeFiLlama
 * @param {number} chainID - Chain ID
 * @returns {string} - Formatted chain name
 */
const getChainName = (chainID) => {
  const chainKey = CHAIN_MAPPING[chainID];
  if (!chainKey) {
    console.warn(`Unknown chainID: ${chainID}, defaulting to ethereum`);
    return 'ethereum';
  }
  return utils.formatChain(chainKey);
};

/**
 * Calculate TVL in USD using shareTokenSupply data
 * @param {Object} pool - Complete pool with shareTokenSupply
 * @returns {number} - TVL in USD
 */
const calculateTVLFromPool = (pool) => {
  if (!pool || !pool.shareTokenSupply || !pool.shareTokenSupply.currencyAmounts) {
    return 0;
  }

  try {
    // Find USD value in shareTokenSupply
    const usdAmount = pool.shareTokenSupply.currencyAmounts.find(ca => ca.currencyID === 'USD');
    if (usdAmount && usdAmount.number > 0) {
      return usdAmount.number;
    }

    // Fallback: use main shareTokenSupply number
    return pool.shareTokenSupply.number || 0;
  } catch (error) {
    console.error('Error calculating TVL from pool:', error);
    return 0;
  }
};

/**
 * Get all pools with automatic pagination
 * @param {Function} createPoolStatsQuery - Function to create pool query
 * @returns {Promise<Array>} - Complete list of pools
 */
const getAllPools = async (createPoolStatsQuery) => {
  let allPools = [];
  let offset = 0;
  const limit = 100;
  let hasMore = true;

  while (hasMore) {
    try {
      const query = createPoolStatsQuery(offset, limit);
      const response = await makeGraphQLRequest(query);
      
      if (response.data.getPoolStats.__typename === 'SimpleError') {
        throw new Error(response.data.getPoolStats.description);
      }
      
      const pools = response.data.getPoolStats.items || [];
      const metadata = response.data.getPoolStats.metadata;
      
      allPools = allPools.concat(pools);
      
      // Check if there are more pools
      hasMore = pools.length === limit && offset + limit < metadata.numElements;
      offset += limit;
      
    } catch (error) {
      console.error(`Error fetching pools at offset ${offset}:`, error);
      break;
    }
  }

  return allPools;
};

/**
 * Get underlying tokens from a pool configuration
 * @param {Object} poolConfig - Pool configuration
 * @param {Array} addresses - Token ID to address mapping
 * @returns {Array<string>} - List of token addresses
 */
const getUnderlyingTokens = (poolConfig, addresses) => {
  if (!poolConfig || !poolConfig.tokens || !Array.isArray(poolConfig.tokens)) {
    return [];
  }

  return poolConfig.tokens
    .map(tokenId => {
      const addressInfo = addresses.find(addr => addr.tokenID === tokenId);
      return addressInfo ? addressInfo.address.toLowerCase() : null;
    })
    .filter(address => address !== null);
};

/**
 * Get reward tokens if they exist
 * @param {Object} poolStats - Pool statistics
 * @param {Array} gauges - Gauge configuration list
 * @param {Array} addresses - Token ID to address mapping
 * @returns {Array<string>} - List of reward token addresses
 */
const getRewardTokens = (poolStats, gauges, addresses) => {
  if (!gauges || !Array.isArray(gauges)) {
    return [];
  }

  const poolGauges = gauges.filter(gauge => gauge.poolID === poolStats.shareTokenID);
  
  return poolGauges
    .map(gauge => {
      const addressInfo = addresses.find(addr => addr.tokenID === gauge.rewardTokenID);
      return addressInfo ? addressInfo.address.toLowerCase() : null;
    })
    .filter(address => address !== null);
};

/**
 * Validate that pool data is valid
 * @param {Object} pool - Pool data
 * @returns {boolean} - Whether the pool is valid
 */
const isValidPool = (pool) => {
  return pool &&
         pool.address &&
         (pool.apr > 0 || pool.estimatedApr > 0) &&
         pool.reserves &&
         Array.isArray(pool.reserves) &&
         pool.reserves.length > 0 &&
         pool.reserves.some(reserve => reserve.currencyAmounts && reserve.currencyAmounts.length > 0);
};

/**
 * Create specific pool URL
 * @param {string} poolId - Pool ID/name (e.g., "GT3-WBTC")
 * @returns {string} - Pool URL
 */
const createPoolUrl = (poolId) => {
  return `https://dapp.gt3.finance/explore/pools/${poolId}`;
};

module.exports = {
  GRAPHQL_ENDPOINT,
  PROJECT_KEY,
  REQUEST_HEADERS,
  CHAIN_MAPPING,
  makeGraphQLRequest,
  getChainName,
  calculateTVLFromPool,
  getAllPools,
  getUnderlyingTokens,
  getRewardTokens,
  isValidPool,
  createPoolUrl
}; 