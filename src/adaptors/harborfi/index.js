const { request, gql } = require('graphql-request');
const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

/**
 * HarborFi Adapter
 * 
 * Harbor Finance is a synthetic asset protocol that offers:
 * - haTOKENS (Harbor Anchored Tokens): Pegged synthetic assets that earn amplified yield
 * - hsTOKENS (Harbor Sail Tokens): Rebalancing variable leverage tokens
 * - Stability Pools: Collateral Pools and Sail Pools that maintain system solvency and earn yield
 * 
 * Each market has two pools:
 * - Collateral Pool (stabilityPoolCollateral): Base yield pool
 * - Sail Pool (stabilityPoolLeveraged): Leveraged yield pool
 * 
 * The displayed APR is the combination/average of both pools' APRs.
 * 
 * Documentation: https://docs.harborfinance.io/
 */

// ============================================================================
// CONFIGURATION - UPDATE THESE VALUES WITH ACTUAL DEPLOYMENT DETAILS
// ============================================================================

// Chains where HarborFi is deployed
// Chain names should match https://api.llama.fi/chains format
const CHAIN = 'ethereum'; // TODO: Update if deployed on different chain(s)

// Subgraph/API options (not used - we use on-chain calls)
const SUBGRAPH_URL = null;
const API_BASE_URL = null;
const CHAINS = {}; // Empty - not using API method

// Simulation mode: Set to true to simulate $1000 USD annual rewards streaming to each pool
// This will calculate APR based on pool TVL and the simulated reward amount
const SIMULATION_MODE = process.env.HARBORFI_SIMULATION === 'true' || false;
const SIMULATED_ANNUAL_REWARDS_USD = 1000; // $1000 USD per pool per year

// On-chain contract addresses
// Markets are grouped by pegged token (haETH, haBTC)
// Each market has a Collateral Pool, Sail Pool, Sail Token, and Price Oracle
// Market TVL = (Anchor Token Total Supply × Anchor Price) + (Sail Token Total Supply × Sail Price)
const MARKETS = [
  // haETH markets
  {
    peggedTokenSymbol: 'haETH',
    peggedTokenAddress: '0x7A53EBc85453DD006824084c4f4bE758FcF8a5B5', // haETH (Anchor Token)
    sailTokenAddress: null, // TODO: Add sail token address for ETH/fxUSD market
    collateralPoolAddress: '0x1F985CF7C10A81DE1940da581208D2855D263D72', // ETH/fxUSD Anchor Pool
    sailPoolAddress: '0x438B29EC7a1770dDbA37D792F1A6e76231Ef8E06', // ETH/fxUSD Sail Pool
    priceOracleAddress: '0x71437C90F1E0785dd691FD02f7bE0B90cd14c097', // Price oracle for ETH/fxUSD
    minterAddress: '0xd6E2F8e57b4aFB51C6fA4cbC012e1cE6aEad989F', // Minter (has peggedTokenPrice function)
  },
  // haBTC markets
  {
    peggedTokenSymbol: 'haBTC',
    peggedTokenAddress: '0x25bA4A826E1A1346dcA2Ab530831dbFF9C08bEA7', // haBTC (Anchor Token)
    sailTokenAddress: null, // TODO: Add sail token address for BTC/fxUSD market
    collateralPoolAddress: '0x86561cdB34ebe8B9abAbb0DD7bEA299fA8532a49', // BTC/fxUSD Anchor Pool
    sailPoolAddress: '0x9e56F1E1E80EBf165A1dAa99F9787B41cD5bFE40', // BTC/fxUSD Sail Pool
    priceOracleAddress: '0x8F76a260c5D21586aFfF18f880FFC808D0524A73', // Price oracle for BTC/fxUSD
    minterAddress: '0x33e32ff4d0677862fa31582CC654a25b9b1e4888', // Minter (has peggedTokenPrice function)
  },
  {
    peggedTokenSymbol: 'haBTC',
    peggedTokenAddress: '0x25bA4A826E1A1346dcA2Ab530831dbFF9C08bEA7', // haBTC (Anchor Token)
    sailTokenAddress: '0x817ADaE288eD46B8618AAEffE75ACD26A0a1b0FD', // hsSTETH-BTC (Sail Token for BTC/stETH)
    collateralPoolAddress: '0x667Ceb303193996697A5938cD6e17255EeAcef51', // BTC/stETH Anchor Pool
    sailPoolAddress: '0xCB4F3e21DE158bf858Aa03E63e4cEc7342177013', // BTC/stETH Sail Pool
    priceOracleAddress: '0xE370289aF2145A5B2F0F7a4a900eBfD478A156dB', // stETH/BTC aggregator
    minterAddress: '0xF42516EB885E737780EB864dd07cEc8628000919', // BTC/stETH Minter
  },
];

// Contract ABIs needed for on-chain queries
// Based on Harbor Finance documentation: https://docs.harborfinance.io/
const STABILITY_POOL_ABI = [
  {
    name: 'totalAssets',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'totalAssetSupply',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
  {
    name: 'getAPRBreakdown',
    type: 'function',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [
      { name: 'collateralTokenAPR', type: 'uint256' }, // 16 decimals (1e16 = 1%)
      { name: 'steamTokenAPR', type: 'uint256' },      // 16 decimals (1e16 = 1%)
    ],
    stateMutability: 'view',
  },
];

const ERC20_ABI = [
  {
    name: 'decimals',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint8' }],
    stateMutability: 'view',
  },
  {
    name: 'symbol',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'string' }],
    stateMutability: 'view',
  },
  {
    name: 'totalSupply',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
];

// Price Oracle ABI - can use latestAnswer() or getPrice() depending on oracle type
const PRICE_ORACLE_ABI = [
  {
    name: 'latestAnswer',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'int256' }],
    stateMutability: 'view',
  },
  {
    name: 'getPrice',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }],
    stateMutability: 'view',
  },
];

// Minter ABI - has peggedTokenPrice() function
const MINTER_ABI = [
  {
    name: 'peggedTokenPrice',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }], // 18 decimals
    stateMutability: 'view',
  },
];

// ============================================================================
// SUBGRAPH QUERY (Option 1 - Recommended if subgraph exists)
// ============================================================================

// Subgraph query to get markets with both collateral and sail pools
const marketsQuery = gql`
  query GetMarkets {
    markets {
      id
      minterAddress
      peggedToken {
        id
        symbol
        decimals
      }
      collateralPool {
        id
        address
        totalValueLockedUSD
        apyCollateral
        apySteam
      }
      sailPool {
        id
        address
        totalValueLockedUSD
        apyCollateral
        apySteam
      }
      chain
    }
  }
`;

// Fallback query if markets are structured differently
const stabilityPoolsQuery = gql`
  query GetStabilityPools {
    stabilityPools {
      id
      address
      poolType
      marketId
      token {
        id
        symbol
        decimals
      }
      totalValueLockedUSD
      apyCollateral
      apySteam
      chain
    }
  }
`;

// ============================================================================
// API HELPER FUNCTIONS (Option 2)
// ============================================================================

async function fetchMarketsFromAPI(chain) {
  if (!API_BASE_URL) return [];
  
  try {
    // Try to fetch markets directly (preferred)
    try {
      const response = await axios.get(`${API_BASE_URL}/markets`, {
        params: { chain },
      });
      return response.data || [];
    } catch (error) {
      // Fallback: fetch pools and group by market
      const response = await axios.get(`${API_BASE_URL}/stability-pools`, {
        params: { chain },
      });
      const pools = response.data || [];
      
      // Group pools by market
      const marketsMap = {};
      pools.forEach((pool) => {
        const marketId = pool.marketId || pool.market?.id;
        if (!marketsMap[marketId]) {
          marketsMap[marketId] = {
            id: marketId,
            peggedToken: pool.peggedToken || pool.token,
            chain: pool.chain || chain,
            collateralPool: null,
            sailPool: null,
          };
        }
        
        if (pool.poolType === 'collateral' || pool.poolType === 'Collateral') {
          marketsMap[marketId].collateralPool = pool;
        } else if (pool.poolType === 'sail' || pool.poolType === 'Sail' || pool.poolType === 'leveraged') {
          marketsMap[marketId].sailPool = pool;
        }
      });
      
      return Object.values(marketsMap);
    }
  } catch (error) {
    console.error(`Error fetching markets from API for ${chain}:`, error);
    return [];
  }
}

// ============================================================================
// ON-CHAIN HELPER FUNCTIONS (Option 3)
// ============================================================================

/**
 * Fetch pool data from on-chain contracts using getAPRBreakdown
 * Groups markets by pegged token and returns the lowest APR per token
 */
async function fetchPoolsFromChain() {
  // Group markets by pegged token symbol
  const marketsByToken = {};
  for (const market of MARKETS) {
    const { peggedTokenSymbol } = market;
    if (!marketsByToken[peggedTokenSymbol]) {
      marketsByToken[peggedTokenSymbol] = [];
    }
    marketsByToken[peggedTokenSymbol].push(market);
  }
  
  const pools = [];
  
  // Process each pegged token group
  for (const [peggedTokenSymbol, tokenMarkets] of Object.entries(marketsByToken)) {
    const tokenMarket = tokenMarkets[0];
    const peggedTokenAddress = tokenMarket.peggedTokenAddress;
    
    // Collect all APRs from all markets for this token
    const allAPRs = [];
    let totalTVL = 0;
    
    try {
      // Fetch pegged token price from minter (returns price in underlying asset, not USD)
      // peggedTokenPrice returns the price of 1 haBTC/haETH in terms of underlying (BTC/ETH) in 18 decimals
      // e.g., 1e18 = 1 BTC/ETH worth, 0.5e18 = 0.5 BTC/ETH worth
      let peggedTokenPriceInUnderlying = 0; // Price in underlying asset (BTC or ETH)
      let underlyingAssetPriceUSD = 0; // USD price of underlying asset (BTC or ETH)
      let decimals = 18;
      
      // Determine underlying asset based on token symbol
      const underlyingAssetAddress = peggedTokenSymbol === 'haBTC' 
        ? '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599' // WBTC
        : '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'; // WETH
      
      // Get pegged token price in underlying asset from minter
      // Try all markets' minters in case one fails
      for (const market of tokenMarkets) {
        if (market.minterAddress && peggedTokenPriceInUnderlying === 0) {
          try {
            const minterPriceResult = await sdk.api.abi.call({
              target: market.minterAddress,
              abi: MINTER_ABI.find((m) => m.name === 'peggedTokenPrice'),
              chain: CHAIN,
            });
            if (minterPriceResult?.output) {
              // peggedTokenPrice is in 18 decimals, represents underlying asset units
              // e.g., 1000000000000000000 = 1 BTC/ETH worth
              peggedTokenPriceInUnderlying = Number(minterPriceResult.output) / 1e18;
              console.log(`  peggedTokenPrice from minter: ${peggedTokenPriceInUnderlying.toFixed(6)} ${peggedTokenSymbol === 'haBTC' ? 'BTC' : 'ETH'}`);
              break; // Found a working minter
            }
          } catch (error) {
            // Try next market's minter
            continue;
          }
        }
      }
      
      // If minter call failed, assume 1:1 peg (1 haBTC = 1 BTC, 1 haETH = 1 ETH)
      if (peggedTokenPriceInUnderlying === 0) {
        peggedTokenPriceInUnderlying = 1;
        console.log(`  Using default peg ratio: 1.0 ${peggedTokenSymbol === 'haBTC' ? 'BTC' : 'ETH'}`);
      }
      
      // Get underlying asset (BTC/ETH) price in USD from coins API
      try {
        const priceResponse = await axios.get(
          `https://coins.llama.fi/prices/current/${CHAIN}:${underlyingAssetAddress}`
        );
        const priceKey = Object.keys(priceResponse.data.coins || {}).find(
          key => key.toLowerCase() === `${CHAIN}:${underlyingAssetAddress.toLowerCase()}`
        );
        underlyingAssetPriceUSD = priceResponse.data.coins[priceKey]?.price || 0;
        if (underlyingAssetPriceUSD > 0) {
          console.log(`  ${peggedTokenSymbol === 'haBTC' ? 'BTC' : 'ETH'} price in USD: $${underlyingAssetPriceUSD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
        }
      } catch (error) {
        console.log(`  Failed to get ${peggedTokenSymbol === 'haBTC' ? 'BTC' : 'ETH'} price from coins API`);
      }
      
      // Calculate final USD price per token
      // Final price = (peggedTokenPrice in underlying) * (underlying asset price in USD)
      const peggedTokenPriceUSD = peggedTokenPriceInUnderlying * underlyingAssetPriceUSD;
      if (peggedTokenPriceUSD > 0) {
        console.log(`  Final ${peggedTokenSymbol} price: $${peggedTokenPriceUSD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
      }
      
      // Fetch token decimals
      try {
        const decimalsResult = await sdk.api.abi.call({
          target: peggedTokenAddress,
          abi: ERC20_ABI.find((m) => m.name === 'decimals'),
          chain: CHAIN,
        });
        decimals = Number(decimalsResult?.output || 18);
      } catch (error) {
        console.log(`  Decimals lookup failed, using default 18`);
      }
      
      // Fetch token decimals for haToken
      try {
        const decimalsResult = await sdk.api.abi.call({
          target: peggedTokenAddress,
          abi: ERC20_ABI.find((m) => m.name === 'decimals'),
          chain: CHAIN,
        });
        decimals = Number(decimalsResult?.output || 18);
      } catch (error) {
        console.log(`  Decimals lookup failed, using default 18`);
      }
      
      // Process each market for this token
      // TVL = sum of haTokens deposited in stability pools across all markets
      // Sail tokens are counter-leverage positions and don't count towards TVL
      for (const market of tokenMarkets) {
        const { collateralPoolAddress, sailPoolAddress } = market;
        
        try {
          console.log(`Fetching data for ${peggedTokenSymbol} market - Collateral: ${collateralPoolAddress}, Sail: ${sailPoolAddress}`);
          // Fetch data from both pools in parallel
          const zeroAddress = '0x0000000000000000000000000000000000000000';
          
          // Get haToken amounts deposited in stability pools
          const [
            collateralTVLResult,
            sailTVLResult,
            collateralAPRResult,
            sailAPRResult,
          ] = await Promise.all([
            // Collateral Pool TVL - amount of haTokens deposited
            sdk.api.abi.call({
              target: collateralPoolAddress,
              abi: STABILITY_POOL_ABI.find((m) => m.name === 'totalAssets'),
              chain: CHAIN,
            }).catch(() => 
              sdk.api.abi.call({
                target: collateralPoolAddress,
                abi: STABILITY_POOL_ABI.find((m) => m.name === 'totalAssetSupply'),
                chain: CHAIN,
              })
            ),
            // Sail Pool TVL - amount of haTokens deposited
            sailPoolAddress ? sdk.api.abi.call({
              target: sailPoolAddress,
              abi: STABILITY_POOL_ABI.find((m) => m.name === 'totalAssets'),
              chain: CHAIN,
            }).catch(() => 
              sdk.api.abi.call({
                target: sailPoolAddress,
                abi: STABILITY_POOL_ABI.find((m) => m.name === 'totalAssetSupply'),
                chain: CHAIN,
              })
            ) : Promise.resolve({ output: null }),
            // Collateral Pool APR using getAPRBreakdown
            sdk.api.abi.call({
              target: collateralPoolAddress,
              abi: STABILITY_POOL_ABI.find((m) => m.name === 'getAPRBreakdown'),
              params: [zeroAddress],
              chain: CHAIN,
            }).catch(() => null),
            // Sail Pool APR using getAPRBreakdown
            sailPoolAddress ? sdk.api.abi.call({
              target: sailPoolAddress,
              abi: STABILITY_POOL_ABI.find((m) => m.name === 'getAPRBreakdown'),
              params: [zeroAddress],
              chain: CHAIN,
            }).catch(() => null) : Promise.resolve(null),
          ]);
          
          // Calculate TVL values first (needed for both APR calculation and simulation)
          const collateralTVLRaw = BigInt(collateralTVLResult?.output || 0);
          const sailTVLRaw = BigInt(sailTVLResult?.output || 0);
          const collateralTVLTokens = Number(collateralTVLRaw) / (10 ** decimals);
          const sailTVLTokens = Number(sailTVLRaw) / (10 ** decimals);
          const collateralTVLUsd = collateralTVLTokens * peggedTokenPriceUSD;
          const sailTVLUsd = sailTVLTokens * peggedTokenPriceUSD;
          
          // Parse APR results (format: [collateralTokenAPR, steamTokenAPR] in 1e16 units)
          // Note: APR might be 0 if no rewards are currently being streamed
          let collateralAPR = 0;
          let sailAPR = 0;
          
          if (collateralAPRResult?.output) {
            collateralAPR = (Number(collateralAPRResult.output[0]) / 1e16) * 100 + 
                            (Number(collateralAPRResult.output[1]) / 1e16) * 100;
          }
          
          if (sailAPRResult?.output) {
            sailAPR = (Number(sailAPRResult.output[0]) / 1e16) * 100 + 
                      (Number(sailAPRResult.output[1]) / 1e16) * 100;
          }
          
          // Simulation mode: Calculate APR based on $1000 annual rewards if no real APR data
          // APR = (Annual Rewards / TVL) * 100
          // Both pools receive $1000 annual rewards, APR is calculated per pool based on their TVL
          
          if (SIMULATION_MODE) {
            // Calculate simulated APR for each pool based on $1000 annual rewards
            if (collateralTVLUsd > 0) {
              const simulatedCollateralAPR = (SIMULATED_ANNUAL_REWARDS_USD / collateralTVLUsd) * 100;
              if (collateralAPR === 0 || !collateralAPRResult?.output) {
                collateralAPR = simulatedCollateralAPR;
                console.log(`  [SIMULATION] Collateral Pool APR: ${simulatedCollateralAPR.toFixed(2)}% (based on $${SIMULATED_ANNUAL_REWARDS_USD} annual rewards / $${collateralTVLUsd.toFixed(2)} TVL)`);
              }
            }
            
            if (sailTVLUsd > 0) {
              const simulatedSailAPR = (SIMULATED_ANNUAL_REWARDS_USD / sailTVLUsd) * 100;
              if (sailAPR === 0 || !sailAPRResult?.output) {
                sailAPR = simulatedSailAPR;
                console.log(`  [SIMULATION] Sail Pool APR: ${simulatedSailAPR.toFixed(2)}% (based on $${SIMULATED_ANNUAL_REWARDS_USD} annual rewards / $${sailTVLUsd.toFixed(2)} TVL)`);
              }
            }
          }
          
          // Calculate market APR: take the lowest between collateral and sail APR
          // Don't average - return whichever is lower
          const marketAPRs = [];
          if (collateralAPR > 0 && collateralTVLUsd > 0) {
            marketAPRs.push(collateralAPR);
          }
          if (sailAPR > 0 && sailTVLUsd > 0) {
            marketAPRs.push(sailAPR);
          }
          
          // Use the lowest APR between collateral and sail for this market
          const marketAPR = marketAPRs.length > 0 ? Math.min(...marketAPRs) : 0;
          
          // Collect APR for minimum calculation across all markets
          if (marketAPR > 0) {
            allAPRs.push(marketAPR);
          }
          
          // Calculate market TVL from haTokens deposited in stability pools
          // TVL = (haTokens in Collateral Pool + haTokens in Sail Pool) × haToken Price
          const totalTVLRaw = collateralTVLRaw + sailTVLRaw;
          // Convert BigInt to number properly by dividing first, then converting
          const marketTVLTokens = Number(totalTVLRaw) / (10 ** decimals);
          const marketTVLUsd = marketTVLTokens * peggedTokenPriceUSD;
          totalTVL += marketTVLUsd; // Accumulate TVL across all markets
          
          console.log(`  Market TVL: ${marketTVLTokens.toFixed(6)} haTokens = $${marketTVLUsd.toFixed(2)} USD`);
          console.log(`    - Collateral Pool: ${collateralTVLTokens.toFixed(6)} haTokens ($${collateralTVLUsd.toFixed(2)})${collateralAPR > 0 ? ` - APR: ${collateralAPR.toFixed(2)}%` : ''}`);
          console.log(`    - Sail Pool: ${sailTVLTokens.toFixed(6)} haTokens ($${sailTVLUsd.toFixed(2)})${sailAPR > 0 ? ` - APR: ${sailAPR.toFixed(2)}%` : ''}`);
          if (marketAPR > 0) {
            const usedAPR = marketAPRs.length === 2 && collateralAPR < sailAPR ? 'collateral (lowest)' : 
                           marketAPRs.length === 2 && sailAPR < collateralAPR ? 'sail (lowest)' :
                           marketAPRs.length === 1 ? (collateralAPR > 0 ? 'collateral' : 'sail') : 'none';
            console.log(`  Market APR: ${marketAPR.toFixed(2)}% (using ${usedAPR} APR, real APR calls: collateral=${collateralAPRResult ? 'success' : 'failed'}, sail=${sailAPRResult ? 'success' : 'failed'})`);
          } else {
            console.log(`  Market APR: 0.00% (APR calls: collateral=${collateralAPRResult ? 'success' : 'failed'}, sail=${sailAPRResult ? 'success' : 'failed'})`);
          }
      
      // Track if we have any TVL data but no APR
      if (marketTVLUsd > 0 && marketAPR === 0) {
        allAPRs.push(-1); // Marker that we have TVL data but no APR
      }
          
        } catch (error) {
          // Log error but don't fail completely - we might still have TVL data
          // getAPRBreakdown might revert if there are no active rewards
          console.error(`  Error fetching pools for ${peggedTokenSymbol} market:`, error.message || error);
          // Try to continue with partial data if TVL calls succeeded
        }
      }
      
      // Filter out the TVL marker (-1) and calculate final APR
      const validAPRs = allAPRs.filter(apr => apr >= 0);
      const hasTokenTVL = allAPRs.some(apr => apr === -1);
      
      // Use the lowest APR from all markets for this token
      // When multiple markets exist, prefer the one with better APR (lower is more conservative)
      // Note: APR can be 0 if no rewards are currently streaming
      const finalAPR = validAPRs.length > 0 ? Math.min(...validAPRs) : 0;
      
      if (SIMULATION_MODE && finalAPR > 0) {
        console.log(`  [SIMULATION] Final APR calculated from ${validAPRs.length} market(s) with simulated $${SIMULATED_ANNUAL_REWARDS_USD} rewards per pool`);
      }
      
      console.log(`\n${peggedTokenSymbol} Summary:`);
      console.log(`  Total TVL: $${totalTVL.toFixed(2)} (from haTokens deposited in stability pools)`);
      console.log(`  Final APR: ${finalAPR.toFixed(2)}% (from ${validAPRs.length} market(s))`);
      
      // Create pool entry for this token
      // Return pool only if TVL >= $10k (DefiLlama minimum threshold)
      // Note: keepFinite() requires at least one APY field to be finite, so always set apyBase to 0 (even if APR calls failed)
      // 0 is a valid APY value when no rewards are currently streaming
      if (totalTVL >= 10000) {
        pools.push({
          pool: `${peggedTokenAddress}-${CHAIN}`.toLowerCase(),
          chain: utils.formatChain(CHAIN),
          project: 'harborfi',
          symbol: peggedTokenSymbol,
          tvlUsd: totalTVL,
          // Always set apyBase (even if 0) so it passes keepFinite() check
          // Use finalAPR if we got APR data, otherwise 0 (no rewards streaming)
          apyBase: validAPRs.length > 0 ? finalAPR : 0,
          underlyingTokens: [peggedTokenAddress],
          poolMeta: `Combined from ${tokenMarkets.length} market(s)`,
        });
        console.log(`  ✅ Added pool for ${peggedTokenSymbol}`);
      } else if (totalTVL > 0 && totalTVL < 10000) {
        console.log(`  ⚠️  Skipping ${peggedTokenSymbol} - TVL $${totalTVL.toFixed(2)} is below $10k threshold`);
      } else {
        console.log(`  ⚠️  Skipping ${peggedTokenSymbol} - no TVL data available (TVL: $${totalTVL.toFixed(2)})`);
      }
    } catch (error) {
      console.error(`Error processing ${peggedTokenSymbol}:`, error);
    }
  }
  
  return pools;
}

// ============================================================================
// MAIN APY FUNCTION
// ============================================================================

const apy = async () => {
  let allPools = [];

  // If using subgraph
  if (SUBGRAPH_URL) {
    try {
      // Try markets query first (preferred structure)
      let marketsData;
      try {
        marketsData = await request(SUBGRAPH_URL, marketsQuery);
      } catch (error) {
        // Fallback to stability pools query
        console.log('Markets query failed, trying stability pools query...');
        marketsData = await request(SUBGRAPH_URL, stabilityPoolsQuery);
      }
      
      // Process markets query results (if available)
      if (marketsData.markets) {
        marketsData.markets.forEach((market) => {
          const collateralPool = market.collateralPool;
          const sailPool = market.sailPool;
          
          // Calculate combined APR from both pools
          const collateralAPR = collateralPool
            ? (Number(collateralPool.apyCollateral || 0) + Number(collateralPool.apySteam || 0))
            : 0;
          const sailAPR = sailPool
            ? (Number(sailPool.apyCollateral || 0) + Number(sailPool.apySteam || 0))
            : 0;
          
          // Average the APRs (matching frontend logic)
          const aprValues = [collateralAPR, sailAPR].filter((v) => v > 0);
          const combinedAPR = aprValues.length > 0
            ? aprValues.reduce((sum, apr) => sum + apr, 0) / aprValues.length
            : 0;
          
          // Calculate combined TVL
          const collateralTVL = Number(collateralPool?.totalValueLockedUSD || 0);
          const sailTVL = Number(sailPool?.totalValueLockedUSD || 0);
          const totalTVL = collateralTVL + sailTVL;
          
          if (totalTVL > 0 || combinedAPR > 0) {
            allPools.push({
              pool: `${market.peggedToken.id}-${market.chain}`.toLowerCase(),
              chain: utils.formatChain(market.chain),
              project: 'harborfi',
              symbol: market.peggedToken.symbol,
              tvlUsd: totalTVL,
              apyBase: combinedAPR > 0 ? combinedAPR : undefined,
              underlyingTokens: [market.peggedToken.id],
              poolMeta: 'Combined Collateral & Sail Pools',
            });
          }
        });
      } 
      // Process stability pools query results (fallback structure)
      else if (marketsData.stabilityPools) {
        // Group pools by marketId
        const poolsByMarket = {};
        
        marketsData.stabilityPools.forEach((pool) => {
          const marketId = pool.marketId || pool.market?.id;
          if (!poolsByMarket[marketId]) {
            poolsByMarket[marketId] = {
              collateral: null,
              sail: null,
              peggedToken: pool.token,
              chain: pool.chain,
            };
          }
          
          const poolAPR = (Number(pool.apyCollateral || 0) + Number(pool.apySteam || 0));
          const poolData = {
            address: pool.address,
            tvl: Number(pool.totalValueLockedUSD || 0),
            apr: poolAPR,
          };
          
          if (pool.poolType === 'collateral' || pool.poolType === 'Collateral') {
            poolsByMarket[marketId].collateral = poolData;
          } else if (pool.poolType === 'sail' || pool.poolType === 'Sail' || pool.poolType === 'leveraged') {
            poolsByMarket[marketId].sail = poolData;
          }
        });
        
        // Create combined pools
        Object.entries(poolsByMarket).forEach(([marketId, market]) => {
          const collateralAPR = market.collateral?.apr || 0;
          const sailAPR = market.sail?.apr || 0;
          const aprValues = [collateralAPR, sailAPR].filter((v) => v > 0);
          const combinedAPR = aprValues.length > 0
            ? aprValues.reduce((sum, apr) => sum + apr, 0) / aprValues.length
            : 0;
          
          const totalTVL = (market.collateral?.tvl || 0) + (market.sail?.tvl || 0);
          
          if (totalTVL > 0 || combinedAPR > 0) {
            allPools.push({
              pool: `${market.peggedToken.id}-${market.chain}`.toLowerCase(),
              chain: utils.formatChain(market.chain),
              project: 'harborfi',
              symbol: market.peggedToken.symbol,
              tvlUsd: totalTVL,
              apyBase: combinedAPR > 0 ? combinedAPR : undefined,
              underlyingTokens: [market.peggedToken.id],
              poolMeta: 'Combined Collateral & Sail Pools',
            });
          }
        });
      }
    } catch (error) {
      console.error('Error fetching data from subgraph:', error);
    }
  }

  // If using API
  if (API_BASE_URL && Object.keys(CHAINS).length > 0) {
    for (const [chainKey, chainName] of Object.entries(CHAINS)) {
      try {
        // Fetch markets (which include both collateral and sail pools)
        const markets = await fetchMarketsFromAPI(chainKey);
        
        markets.forEach((market) => {
          const collateralPool = market.collateralPool || market.collateral;
          const sailPool = market.sailPool || market.sail;
          
          // Calculate combined APR from both pools
          const collateralAPR = collateralPool
            ? (Number(collateralPool.apyCollateral || collateralPool.apyBase || 0) + 
               Number(collateralPool.apySteam || collateralPool.apyReward || 0))
            : 0;
          const sailAPR = sailPool
            ? (Number(sailPool.apyCollateral || sailPool.apyBase || 0) + 
               Number(sailPool.apySteam || sailPool.apyReward || 0))
            : 0;
          
          // Average the APRs (matching frontend logic)
          const aprValues = [collateralAPR, sailAPR].filter((v) => v > 0);
          const combinedAPR = aprValues.length > 0
            ? aprValues.reduce((sum, apr) => sum + apr, 0) / aprValues.length
            : 0;
          
          // Calculate combined TVL
          const collateralTVL = Number(collateralPool?.tvlUsd || collateralPool?.totalValueLockedUSD || 0);
          const sailTVL = Number(sailPool?.tvlUsd || sailPool?.totalValueLockedUSD || 0);
          const totalTVL = collateralTVL + sailTVL;
          
          const peggedToken = market.peggedToken || market.token;
          const peggedTokenAddress = peggedToken?.address || peggedToken?.id;
          const peggedTokenSymbol = peggedToken?.symbol || 'haTOKEN';
          
          if (totalTVL > 0 || combinedAPR > 0) {
            allPools.push({
              pool: `${peggedTokenAddress || market.id}-${chainKey}`.toLowerCase(),
              chain: utils.formatChain(chainKey),
              project: 'harborfi',
              symbol: peggedTokenSymbol,
              tvlUsd: totalTVL,
              apyBase: combinedAPR > 0 ? combinedAPR : undefined,
              underlyingTokens: peggedTokenAddress ? [peggedTokenAddress] : [],
              poolMeta: 'Combined Collateral & Sail Pools',
            });
          }
        });
      } catch (error) {
        console.error(`Error fetching data from API for ${chainKey}:`, error);
      }
    }
  }

  // Fetch from on-chain contracts (primary method)
  try {
    const pools = await fetchPoolsFromChain();
    allPools = allPools.concat(pools);
  } catch (error) {
    console.error(`Error fetching data from chain:`, error);
  }

  // Filter out pools with invalid data and ensure finite values
  return allPools.filter((p) => p && utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.harborfinance.io', // TODO: Update with actual app URL
};
