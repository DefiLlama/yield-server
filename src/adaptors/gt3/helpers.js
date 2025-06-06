// Utilidades específicas para GT3 Finance
const utils = require('../utils');

// Usar superagent como fetch si fetch no está disponible
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

// Configuración de la API
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

// Mapeo de chainID a nombres de cadena para DeFiLlama
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
 * Función para hacer peticiones GraphQL usando fetch
 * @param {Object} query - Query GraphQL a ejecutar
 * @returns {Promise<Object>} - Respuesta de la API
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
 * Obtener nombre de cadena formateado para DeFiLlama
 * @param {number} chainID - ID de la cadena
 * @returns {string} - Nombre de la cadena formateado
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
 * Calcular TVL en USD usando los datos de shareTokenSupply
 * @param {Object} pool - Pool completo con shareTokenSupply
 * @returns {number} - TVL en USD
 */
const calculateTVLFromPool = (pool) => {
  if (!pool || !pool.shareTokenSupply || !pool.shareTokenSupply.currencyAmounts) {
    return 0;
  }

  try {
    // Buscar el valor en USD en shareTokenSupply
    const usdAmount = pool.shareTokenSupply.currencyAmounts.find(ca => ca.currencyID === 'USD');
    if (usdAmount && usdAmount.number > 0) {
      return usdAmount.number;
    }

    // Fallback: usar el número principal del shareTokenSupply
    return pool.shareTokenSupply.number || 0;
  } catch (error) {
    console.error('Error calculating TVL from pool:', error);
    return 0;
  }
};

/**
 * Obtener todos los pools con paginación automática
 * @param {Function} createPoolStatsQuery - Función para crear query de pools
 * @returns {Promise<Array>} - Lista completa de pools
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
      
      // Verificar si hay más pools
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
 * Obtener tokens subyacentes de un pool
 * @param {Object} poolConfig - Configuración del pool
 * @param {Array} addresses - Mapeo de tokenID a address
 * @returns {Array<string>} - Lista de direcciones de tokens
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
 * Obtener tokens de recompensa si existen
 * @param {Object} poolStats - Estadísticas del pool
 * @param {Array} gauges - Lista de gauges de configuración
 * @param {Array} addresses - Mapeo de tokenID a address
 * @returns {Array<string>} - Lista de direcciones de tokens de recompensa
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
 * Validar que los datos del pool son válidos
 * @param {Object} pool - Datos del pool
 * @returns {boolean} - Si el pool es válido
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
 * Crear URL específica del pool
 * @param {string} poolId - ID/nombre del pool (ej: "GT3-WBTC")
 * @returns {string} - URL del pool
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