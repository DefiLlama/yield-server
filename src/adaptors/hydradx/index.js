const { gql, request } = require('graphql-request');
const utils = require('../utils');
const sdk = require('@defillama/sdk');
const { ApiPromise, WsProvider } = require("@polkadot/api");

const HYDRATION_GRAPHQL_URL = "https://galacticcouncil.squids.live/hydration-pools:unified-prod/api/graphql";

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
        project: 'hydration-dex', // Note: Protocol was rebranded from HydraDX to Hydration, folder name remains 'hydradx' for legacy reasons
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

// Get asset balances and calculate USD TVL using current prices
async function getTvlData() {

  try {
    // Omnipool constants
    const omnipoolAccountId = "7L53bUTBbfuj14UpdCNPwmgzzHSsrsTWBHX5pys32mVWM3C1";
    const stablepoolAccountId = "7JP6TvcH5x31TsbC6qVJHEhsW7UNmpREMZuLBpK2bG1goJRS";
    const stablepoolAccountId2 = "7MaKPwwnqN4cqg35PbxsGXUo1dfvjXQ3XfBjWF9UVvKMjJj8";
    const stablepoolAccountId3 = "7LVGEVLFXpsCCtnsvhzkSMQARU7gRVCtwMckG7u7d3V6FVvG";

    const RAW_STATIC_XYK_POOL_DATA = [
      [[ "15L6BQ1sMd9pESapK13dHaXBPPtBYnDnKTVhb2gBeGrrJNBx" ], [ 30, 5 ]], // DOT/MYTH
      [[ "15BuQdFibo2wZmwksPWCJ3owmXCduSU56gaXzVKDc1pcCcsd" ], [ 1000085, 5 ]], // WUD/DOT
      [[ "15nzS2D2wJdh52tqZdUJVMeDQqQe7wJfo5NZKL7pUxhwYgwq" ], [ 5, 252525 ]],  // DOT/EWT
      [[ "15sjxrJkJRCXs64J7wvxNE3vjJ8CGjDPggqeNwEyijvydwri" ], [ 5, 25 ]],      // DOT/UNQ
      [[ "12NzWeY2eDLRbdmjUunmLVE3TBnkgFGy3SCFH2hmDbhLs8qB" ], [ 1000082, 5 ]]  // WIFD/DOT
    ];

    const provider = new WsProvider("wss://hydradx-rpc.dwellir.com");
    const polkadotApi = await ApiPromise.create({ provider });
    await polkadotApi.isReady;

    // Fetch current USD prices from CoinGecko
    const allCgIds = Object.values(cgMapping);
    const uniqueCgIds = [...new Set(allCgIds)];
    const priceResponse = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${uniqueCgIds.join(',')}&vs_currencies=usd`);
    const priceData = await priceResponse.json();

    const processedAssetMetadata = [];
    const assetTvls = {};

    // Use assets.entries() to fetch all registered assets robustly
    const allAssets = await polkadotApi.query.assetRegistry.assets.entries();

    for (const [key, metaOpt] of allAssets) {
      if (metaOpt.isSome) {
        const meta = metaOpt.unwrap();
        // Extract assetId from the storage key
        const assetIdFromKey = key.args[0].toNumber();

        if (assetIdFromKey !== 0) { // Skip asset 0 (HDX) as it's handled separately
          processedAssetMetadata.push({
            assetId: assetIdFromKey,
            symbol: meta.symbol.toHuman(),
            decimals: +meta.decimals,
          });
        }
      }
    }

    // Handle HDX (asset ID 0) separately
    const hdxBalance = await polkadotApi.query.system.account(omnipoolAccountId);
    const hdxTokenBalance = Number(hdxBalance.data.free) / 1e12; // HDX has 12 decimals
    const hdxPrice = priceData['hydradx']?.usd || 0;
    assetTvls['HDX'] = hdxTokenBalance * hdxPrice;

    for (const { decimals, assetId, symbol } of processedAssetMetadata) { 
      const cgId = cgMapping[symbol];
      if (cgId) {
        let tokenBalance = 0;
        
        // Fetch balances from omnipool and stablepools
        const bals = await Promise.all([omnipoolAccountId, stablepoolAccountId, stablepoolAccountId2, stablepoolAccountId3].map(accId =>
          polkadotApi.query.tokens.accounts(accId, assetId)
        ));
        tokenBalance = bals.reduce((acc, bal) => acc + Number(bal.free), 0) / (10 ** decimals);

        const price = priceData[cgId]?.usd || 0;
        const cleanedSymbol = cleanSymbol(symbol);
        assetTvls[cleanedSymbol] = tokenBalance * price;
      }
    }


    // Add XYK Pool TVL using the refined static list
    const staticXykPools = RAW_STATIC_XYK_POOL_DATA.map(entry => {
      if (!entry || !entry[0] || !entry[0][0] || !entry[1] || typeof entry[1][0] === 'undefined' || typeof entry[1][1] === 'undefined') {
        return null;
      }
      return {
        poolAccountId: entry[0][0],
        assetIdA: entry[1][0],
        assetIdB: entry[1][1],
      };
    }).filter(p => p !== null);

    try {
      for (const { poolAccountId, assetIdA, assetIdB } of staticXykPools) {
        let poolTvl = 0;
        let poolComposition = [];
        
        for (const assetId of [assetIdA, assetIdB]) {
          if (typeof assetId !== 'number') {
              continue;
          }
          const tokenInfo = await polkadotApi.query.assetRegistry.assets(assetId);
          if (!tokenInfo.isSome) {
            continue;
          }
          const decimals = +tokenInfo.unwrap().decimals;
          const rawSymbol = tokenInfo.unwrap().symbol;
          const symbol = rawSymbol.isSome ? rawSymbol.unwrap().toUtf8() : null;

          if (!symbol) {
            continue;
          }

          const coingeckoId = cgMapping[symbol];
          if (!coingeckoId) {
            continue;
          }

          const balanceEntry = await polkadotApi.query.tokens.accounts(poolAccountId, assetId);
          const balance = balanceEntry.free.toBigInt();

          if (balance > 0n) {
            const tokenBalance = Number(balance) / (10 ** decimals);
            const price = priceData[coingeckoId]?.usd || 0;
            const assetTvl = tokenBalance * price;
            
            // Add to individual asset TVL
            const cleanedSymbol = cleanSymbol(symbol);
            assetTvls[cleanedSymbol] = (assetTvls[cleanedSymbol] || 0) + assetTvl;
            
            // Add to pool TVL and composition
            poolTvl += assetTvl;
            poolComposition.push(cleanedSymbol);
          }
        }
        
        // Store pool TVL and composition by pool account ID for isolated pools
        if (poolTvl > 0) {
          assetTvls[poolAccountId] = poolTvl;
          assetTvls[`${poolAccountId}_composition`] = poolComposition;
        }
      }
    } catch (error) {
      console.error("Error fetching or processing XYK pool TVL from static list:", error);
    }

    await polkadotApi.disconnect();
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
