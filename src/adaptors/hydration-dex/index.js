const { gql, request } = require('graphql-request');
const utils = require('../utils');
const sdk = require('@defillama/sdk');

const HYDRATION_GRAPHQL_URL = "https://galacticcouncil.squids.live/hydration-pools:whale-prod/api/graphql";

// Asset mapping for TVL calculation
const cgMapping = {
  DAI: 'dai',
  INTR: 'interlay',
  GLMR: 'moonbeam',
  vDOT: 'voucher-dot',
  ZTG: 'zeitgeist',
  CFG: 'centrifuge',
  BNC: 'bifrost-native-coin',
  WETH: 'ethereum',
  DOT: 'polkadot',
  APE: 'apecoin',
  USDC: 'usd-coin',
  USDT: 'tether',
  ASTR: 'astar',
  WBTC: 'wrapped-bitcoin',
  iBTC: 'interbtc',
  HDX: 'hydradx',
  tBTC: 'tbtc',
  AAVE: 'aave',
  PHA: 'pha',
  vASTR: 'bifrost-voucher-astr',
  KSM: 'kusama',
  KILT: 'kilt-protocol',
  SKY: 'sky',
  LINK: 'chainlink',
  SOL: 'solana',
  CRU: 'crust-network',
  EWT: 'energy-web-token',
  UNQ: 'unique-network',
  MYTH: 'mythos',
  WUD: 'gawun-wud',

};

const poolsFunction = async () => {
  try {
    // Fetch yield metrics for all assets
    const yieldMetrics = await fetchYieldMetrics();
    
    // Fetch asset symbols mapping
    const assetSymbols = await fetchAssetSymbols();

    // Fetch TVL data
    const tvlData = await getTvlData();

    // Create symbol lookup map
    const symbolMap = {};
    assetSymbols.forEach(asset => {
      symbolMap[asset.assetRegistryId] = asset.symbol;
    });

    const pools = [];

    // Process each asset's yield metrics
    for (const metric of yieldMetrics) {
      // Handle isolated pools separately (they use pool account IDs instead of asset IDs)
      if (metric.poolType === 'isolatedpool' && metric.id.length > 20) {
        // For isolated pools, get the actual TVL from our TVL data using the pool account ID
        const poolAccountId = metric.id;
        const poolTvl = tvlData[poolAccountId] || 0;
        
        // Skip if no TVL data available for this pool
        if (poolTvl === 0) {
          continue;
        }

        // Parse APY values
        const apyBase = parseFloat(metric.feeApyPerc) || 0;
        const apyReward = parseFloat(metric.incentivesApyPerc) || 0;

        // Skip pools with no yield
        if (apyBase === 0 && apyReward === 0) {
          continue;
        }

        // Get the pool composition from stored data
        const poolComposition = tvlData[`${poolAccountId}_composition`];
        let poolName = poolAccountId.substring(0, 10) + '...';
        let underlyingSymbols = [poolAccountId];
        
        if (poolComposition) {
          poolName = poolComposition.join('-');
          underlyingSymbols = poolComposition;
        }

        // Map incentive tokens to symbols
        const rewardTokens = apyReward > 0 ? mapIncentiveTokens(metric.incentivesTokens, symbolMap) : null;

        const pool = {
          pool: `${poolName}-hydration-dex`,
          chain: 'Polkadot',
          project: 'hydration-dex',
          symbol: poolName,
          tvlUsd: poolTvl,
          apyBase: apyBase > 0 ? apyBase : null,
          apyReward: apyReward > 0 ? apyReward : null,
          rewardTokens: rewardTokens,
          underlyingTokens: underlyingSymbols,
          url: 'https://app.hydration.net/liquidity/all-pools',
          poolMeta: formatPoolType(metric.poolType)
        };

        pools.push(pool);
        continue;
      }
      
      // Get symbol from the mapping
      let symbol = symbolMap[metric.id];
      
      // Skip if no symbol found
      if (!symbol) {
        continue;
      }
      
      // Clean up symbol formatting
      symbol = cleanSymbol(symbol);
      
      // Parse APY values
      const apyBase = parseFloat(metric.feeApyPerc) || 0;
      const apyReward = parseFloat(metric.incentivesApyPerc) || 0;

      // Skip pools with no yield
      if (apyBase === 0 && apyReward === 0) {
        continue;
      }

      // Get TVL for this asset
      let tvlUsd = tvlData[symbol] || 0;

      // Skip pools with no TVL
      if (tvlUsd === 0) {
        continue;
      }

      // Map incentive tokens to symbols
      const rewardTokens = apyReward > 0 ? mapIncentiveTokens(metric.incentivesTokens, symbolMap) : null;

      const pool = {
        pool: `${symbol}-hydration-dex`,
        chain: 'Polkadot',
        project: 'hydration-dex',
        symbol: utils.formatSymbol(symbol),
        tvlUsd: tvlUsd,
        apyBase: apyBase > 0 ? apyBase : null,
        apyReward: apyReward > 0 ? apyReward : null,
        rewardTokens: rewardTokens,
        underlyingTokens: [symbol],
        url: 'https://app.hydration.net/liquidity/all-pools',
        poolMeta: formatPoolType(metric.poolType)
      };

      pools.push(pool);
    }

    return pools;

  } catch (error) {
    console.error('Error fetching HydraDX pools:', error);
    return [];
  }
};

// Fetch yield metrics for all assets
async function fetchYieldMetrics() {
  const query = gql`
    query MyQuery {
      allAssetsYieldMetrics {
        nodes {
          id
          poolType
          feeApyPerc
          incentivesApyPerc
          incentivesTokens
        }
        totalCount
      }
    }
  `;

  const response = await request(HYDRATION_GRAPHQL_URL, query);
  return response.allAssetsYieldMetrics.nodes || [];
}

// Fetch asset symbols mapping
async function fetchAssetSymbols() {
  const query = gql`
    query MyQuery {
      assets {
        nodes {
          assetRegistryId
          symbol
        }
      }
    }
  `;

  const response = await request(HYDRATION_GRAPHQL_URL, query);
  return response.assets.nodes || [];
}

// Fetch omnipool TVL data using the new omnipoolAssetsLatestTvl query
async function fetchOmnipoolTvl() {
  const query = gql`
    query MyQuery {
      omnipoolAssetsLatestTvl {
        nodes {
          assetId
          assetRegistryId
          tvlInRefAssetNorm
          paraBlockHeight
        }
      }
    }
  `;

  const response = await request(HYDRATION_GRAPHQL_URL, query);
  return response.omnipoolAssetsLatestTvl.nodes || [];
}

// Fetch all available XYK pools to get their pool IDs
async function fetchAllXykPools() {
  const query = gql`
    query MyQuery {
      xykpoolsLatestTvl {
        nodes {
          poolId
          tvlInRefAssetNorm
          paraBlockHeight
        }
      }
    }
  `;

  const response = await request(HYDRATION_GRAPHQL_URL, query);
  return response.xykpoolsLatestTvl.nodes || [];
}

// Fetch XYK pool TVL data using the new xykpoolsLatestTvl query
async function fetchXykPoolTvl(poolIds) {
  if (!poolIds || poolIds.length === 0) {
    return [];
  }

  const poolIdsFilter = poolIds.map(id => `"${id}"`).join(', ');
  const query = gql`
    query MyQuery {
      xykpoolsLatestTvl(filter: {poolIds: [${poolIdsFilter}]}) {
        nodes {
          poolId
          tvlInRefAssetNorm
          paraBlockHeight
        }
      }
    }
  `;

  const response = await request(HYDRATION_GRAPHQL_URL, query);
  return response.xykpoolsLatestTvl.nodes || [];
}

// Get asset TVL using the new TVL queries
async function getTvlData() {
  try {
    // Fetch asset symbols mapping
    const assetSymbols = await fetchAssetSymbols();
    
    // Create asset ID to symbol mapping
    const assetIdToSymbol = {};
    assetSymbols.forEach(asset => {
      assetIdToSymbol[asset.assetRegistryId] = asset.symbol;
    });

    const assetTvls = {};

    // Fetch omnipool TVL data
    const omnipoolTvlData = await fetchOmnipoolTvl();
    
    // Process omnipool TVL data
    for (const tvlEntry of omnipoolTvlData) {
      const assetId = tvlEntry.assetRegistryId;
      const symbol = assetIdToSymbol[assetId];
      
      if (symbol) {
        const cleanedSymbol = cleanSymbol(symbol);
        // Skip if we don't have a CoinGecko mapping for this asset
        if (cgMapping[cleanedSymbol]) {
          const tvlUsd = parseFloat(tvlEntry.tvlInRefAssetNorm);
          assetTvls[cleanedSymbol] = tvlUsd;
        }
      }
    }

    // Handle isolated pools (XYK pools) with correct pool ID mapping
    const allXykPools = await fetchAllXykPools();
    
    // Known mappings of pool IDs to compositions based on actual pool IDs
    const xykPoolMappings = {
      '0xbf80080b4d0077544ef058a29e878ae6f6bdb8cf2f462ab390490f668eb50b73': { 
        poolAccountId: "15L6BQ1sMd9pESapK13dHaXBPPtBYnDnKTVhb2gBeGrrJNBx", 
        composition: ['MYTH', 'DOT'] 
      },
      '0xd4044eed8c3a16740b3edf9e85cd6384c66eecf21179843cd863c20bfa6b082f': {
        poolAccountId: "15nzS2D2wJdh52tqZdUJVMeDQqQe7wJfo5NZKL7pUxhwYgwq", 
        composition: ['DOT', 'EWT']
      }
    };

    // Process XYK pool TVL data using known mappings
    for (const xykPool of allXykPools) {
      const poolTvl = parseFloat(xykPool.tvlInRefAssetNorm);
      const poolMapping = xykPoolMappings[xykPool.poolId];
      
      if (poolMapping && poolTvl > 0) {
        assetTvls[poolMapping.poolAccountId] = poolTvl;
        assetTvls[`${poolMapping.poolAccountId}_composition`] = poolMapping.composition;
      }
    }

    return assetTvls;
  } catch (error) {
    console.error('Error fetching TVL data:', error);
    return {};
  }
}

// Helper function to map incentive token IDs to symbols
function mapIncentiveTokens(incentivesTokens, symbolMap) {
  if (!incentivesTokens || !Array.isArray(incentivesTokens) || incentivesTokens.length === 0) {
    return null;
  }
  
  const mappedTokens = incentivesTokens
    .map(tokenId => {
      // Handle HDX (asset ID 0) specially
      if (tokenId === "0" || tokenId === 0) {
        return 'HDX';
      }
      
      // Map other token IDs to symbols
      const symbol = symbolMap[tokenId];
      return symbol ? cleanSymbol(symbol) : null;
    })
    .filter(symbol => symbol !== null); // Remove any unmapped tokens
  
  return mappedTokens.length > 0 ? mappedTokens : null;
}

// Helper function to clean up symbol formatting
function cleanSymbol(symbol) {
  // Handle null or undefined symbols
  if (!symbol) {
    return null;
  }
  
  // Remove common prefixes that might come from the API
  symbol = symbol.replace(/^2-POOL-/i, '');
  symbol = symbol.replace(/^3-POOL-/i, '');
  symbol = symbol.replace(/^4-POOL-/i, '');
  symbol = symbol.replace(/^POOL-/i, '');
  
  // Handle specific symbol mappings for better display
  const symbolMappings = {
    'TBTC': 'tBTC',
    'VASTR': 'vASTR',
    'VDOT': 'vDOT'
  };
  
  const upperSymbol = symbol.toUpperCase();
  if (symbolMappings[upperSymbol]) {
    return symbolMappings[upperSymbol];
  }
  
  return symbol;
}

// Helper function to format pool type for display
function formatPoolType(poolType) {
  switch(poolType) {
    case 'omnipool':
      return 'Omnipool';
    case 'isolatedpool':
      return 'Isolated Pool';
    case 'stableswap':
      return 'Stable Swap';
    default:
      return 'Pool';
  }
}

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.hydration.net/liquidity/all-pools',
};
