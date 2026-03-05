// GT3 Finance adapter for DeFiLlama Yield Server
const utils = require('../utils');
const { PROJECT_CONFIG_QUERY, createPoolStatsQuery } = require('./queries');
const {
  makeGraphQLRequest,
  getChainName,
  calculateTVLFromPool,
  getAllPools,
  getUnderlyingTokens,
  getRewardTokens,
  isValidPool,
  createPoolUrl
} = require('./helpers');

/**
 * Transform GT3 pool to DeFiLlama format
 * @param {Object} pool - GT3 pool data
 * @param {Object} config - Project configuration
 * @param {string} chainName - Chain name
 * @returns {Promise<Object|null>} - Pool in DeFiLlama format or null if invalid
 */
const transformPool = async (pool, config, chainName) => {
  try {
    // Validate pool
    if (!isValidPool(pool)) {
      return null;
    }

    const { tokens, pools: configPools, addresses, gauges } = config;
    
    // Find pool configuration
    const poolConfig = configPools.find(p => p.id === pool.shareTokenID);
    
    // Calculate TVL using shareTokenSupply data directly
    const tvlUsd = calculateTVLFromPool(pool);

    // Filter pools with very low TVL according to DeFiLlama best practices (>$10k)
    if (tvlUsd < 10000) {
      return null;
    }

    // Get most reliable APR (prioritize APR over estimatedApr)
    const aprValue = pool.apr || pool.estimatedApr || 0;
    
    // Convert APR to APY using DeFiLlama's official utility
    const apyBase = utils.aprToApy(aprValue);

    // Get pool symbol - use pool name/id as symbol for better distinction
    const symbol = poolConfig && poolConfig.name ? 
      utils.formatSymbol(poolConfig.name) : 
      `GT3-${pool.id}`;

    // Get underlying tokens
    const underlyingTokens = getUnderlyingTokens(poolConfig, addresses);

    // Get reward tokens
    const rewardTokens = getRewardTokens(pool, gauges, addresses);

    // Create pool in DeFiLlama format
    const poolData = {
      pool: `${pool.address}-${chainName.toLowerCase()}`,
      chain: chainName,
      project: 'gt3',
      symbol: symbol,
      tvlUsd: tvlUsd,
      apyBase: apyBase,
      underlyingTokens: underlyingTokens,
      url: createPoolUrl(pool.id)
    };

    // Add poolMeta with descriptive suffix
    poolData.poolMeta = `${symbol} Liquidity Pool`;

    if (rewardTokens.length > 0) {
      poolData.rewardTokens = rewardTokens;
    }

    return poolData;

  } catch (error) {
    console.error(`Error transforming pool ${pool.id}:`, error);
    return null;
  }
};

/**
 * Main adapter function
 * @returns {Promise<Array>} - List of pools in DeFiLlama format
 */
const apy = async () => {
  try {
    // Get project configuration
    const configResponse = await makeGraphQLRequest(PROJECT_CONFIG_QUERY);
    
    if (configResponse.data.getProjectConfiguration.__typename === 'SimpleError') {
      throw new Error(`Configuration error: ${configResponse.data.getProjectConfiguration.description}`);
    }
    
    const config = configResponse.data.getProjectConfiguration;
    const { chainID } = config;
    const chainName = getChainName(chainID);

    // Get all pool statistics with pagination
    const allPoolStats = await getAllPools(createPoolStatsQuery);

    // Transform pools to DeFiLlama format in parallel
    const poolTransformations = allPoolStats.map(pool => 
      transformPool(pool, config, chainName)
    );
    
    const transformedPools = await Promise.all(poolTransformations);
    
    // Filter valid pools with complete data
    const validPools = transformedPools
      .filter(pool => pool !== null)
      .filter(pool => utils.keepFinite(pool));

    // Sort by TVL descending
    validPools.sort((a, b) => b.tvlUsd - a.tvlUsd);

    return validPools;

  } catch (error) {
    console.error('Error in GT3 adapter:', error);
    return [];
  }
};

/**
 * Adapter module configuration
 */
module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://dapp.gt3.finance/',
  meta: {
    name: 'GT3 Finance',
    description: 'Decentralized yield farming protocol',
    chains: ['Polygon'],
    category: 'yield-farming'
  }
};
