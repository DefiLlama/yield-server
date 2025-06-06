// Adaptador GT3 Finance para DeFiLlama Yield Server
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
 * Transformar pool de GT3 a formato DeFiLlama
 * @param {Object} pool - Datos del pool de GT3
 * @param {Object} config - Configuración del proyecto
 * @param {string} chainName - Nombre de la cadena
 * @returns {Promise<Object|null>} - Pool en formato DeFiLlama o null si es inválido
 */
const transformPool = async (pool, config, chainName) => {
  try {
    // Validar pool
    if (!isValidPool(pool)) {
      console.log(`Pool ${pool.id} invalid:`, {
        hasAddress: !!pool.address,
        hasApr: !!(pool.apr > 0 || pool.estimatedApr > 0),
        hasReserves: !!(pool.reserves && pool.reserves.currencyAmounts)
      });
      return null;
    }

    const { tokens, pools: configPools, addresses, gauges } = config;
    
    // Encontrar configuración del pool
    const poolConfig = configPools.find(p => p.id === pool.shareTokenID);
    
    // Calcular TVL usando los datos de shareTokenSupply directamente
    const tvlUsd = calculateTVLFromPool(pool);

    // Filtrar pools con TVL muy bajo según las mejores prácticas de DeFiLlama (>$10k)
    if (tvlUsd < 10000) {
      console.log(`Pool ${pool.id} filtered out due to low TVL: $${tvlUsd}`);
      return null;
    }

    // Obtener el APR más confiable (priorizar APR sobre estimatedApr)
    const aprValue = pool.apr || 0;
    
    // Convertir APR a APY usando la utilidad oficial de DeFiLlama
    const apyBase = utils.aprToApy(aprValue);

    // Obtener símbolo del pool
    const symbol = poolConfig ? 
      utils.formatSymbol(poolConfig.symbol) : 
      `GT3-${pool.id}`;

    // Obtener tokens subyacentes
    const underlyingTokens = getUnderlyingTokens(poolConfig, addresses);

    // Obtener tokens de recompensa
    const rewardTokens = getRewardTokens(pool, gauges, addresses);

    // Crear pool en formato DeFiLlama
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

    if (poolConfig && poolConfig.name) {
      poolData.poolMeta = poolConfig.name;
    }

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
 * Función principal del adaptador
 * @returns {Promise<Array>} - Lista de pools en formato DeFiLlama
 */
const apy = async () => {
  try {    
    // Obtener configuración del proyecto
    const configResponse = await makeGraphQLRequest(PROJECT_CONFIG_QUERY);
    
    if (configResponse.data.getProjectConfiguration.__typename === 'SimpleError') {
      throw new Error(`Configuration error: ${configResponse.data.getProjectConfiguration.description}`);
    }
    
    const config = configResponse.data.getProjectConfiguration;
    const { chainID } = config;
    const chainName = getChainName(chainID);
    
    // Obtener todas las estadísticas de pools con paginación
    const allPoolStats = await getAllPools(createPoolStatsQuery);
    
    // Transformar pools al formato DeFiLlama en paralelo
    const poolTransformations = allPoolStats.map(pool => 
      transformPool(pool, config, chainName)
    );
    
    const transformedPools = await Promise.all(poolTransformations);
    
    // Filtrar pools válidos y con datos completos
    const validPools = transformedPools
      .filter(pool => pool !== null)
      .filter(pool => {
        const isFinite = utils.keepFinite(pool);
        if (!isFinite) {
          console.log('Pool filtered by keepFinite:', pool);
        }
        return isFinite;
      });

    // Ordenar por TVL descendente
    validPools.sort((a, b) => b.tvlUsd - a.tvlUsd);

    return validPools;

  } catch (error) {
    console.error('Error in GT3 adapter:', error);
    return [];
  }
};

/**
 * Configuración del módulo del adaptador
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
