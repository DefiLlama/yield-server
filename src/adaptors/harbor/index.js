const axios = require('axios');
const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const { MARKETS, CHAINLINK_FEEDS, TOKEN_CHAINLINK_FEED_MAP, UNDERLYING_ASSET_DISPLAY } = require('./config');

/**
 * Harbor Adapter
 * 
 * Harbor Finance is a synthetic asset protocol that offers:
 * - haTOKENS (Harbor Anchored Tokens): Pegged synthetic assets that earn amplified yield
 * - Stability Pools: Collateral Pools and Sail Pools that maintain system solvency and earn yield
 * 
 * Each market has two pools:
 * - Collateral Pool: Base yield pool
 * - Sail Pool: Leveraged yield pool
 * 
 * APR is calculated from reward streaming data using activeRewardTokens() and rewardData()
 * For each market, the lowest APR between collateral and sail pools is used.
 * 
 * Documentation: https://docs.harborfinance.io/
 */

const CHAIN = 'ethereum';

const UNDERLYING_ASSETS = {
  haBTC: '0x2260FAC5E5542a773Aa44fBCfeDf7C193bc2C599', // WBTC
  haETH: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2', // WETH
  haEUR: '0xdb25f211ab05b1c97d595516f45794528a807ad8', // EURS
  haGOLD: 'coingecko:pax-gold', // XAU proxy
  haSILVER: 'coingecko:silver', // XAG proxy
};

// Market configurations are imported from config.js
// See config.js for address verification details and deployment information

// Contract ABIs
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
    name: 'activeRewardTokens',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'address[]' }],
    stateMutability: 'view',
  },
  {
    name: 'rewardData',
    type: 'function',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [
      { name: 'lastUpdate', type: 'uint256' },
      { name: 'finishAt', type: 'uint256' },
      { name: 'rate', type: 'uint256' }, // Reward rate per second (wei)
      { name: 'queued', type: 'uint256' },
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
];

const MINTER_ABI = [
  {
    name: 'peggedTokenPrice',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'uint256' }], // 18 decimals
    stateMutability: 'view',
  },
];

// Chainlink Price Feed ABI
const CHAINLINK_ABI = [
  {
    name: 'latestAnswer',
    type: 'function',
    inputs: [],
    outputs: [{ type: 'int256' }], // Price in 8 decimals for USD pairs
    stateMutability: 'view',
  },
];

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60; // 31,536,000

/**
 * Calculate APR from reward streaming data
 * APR = (rewardRate / 10**decimals * SECONDS_PER_YEAR) * tokenPrice / TVL * 100
 */
async function calculateAPRFromRewards(poolAddress, poolTVLUsd, chain) {
  try {
    // Get active reward tokens for this pool
    const activeRewardTokensResult = await sdk.api.abi.call({
      target: poolAddress,
      abi: STABILITY_POOL_ABI.find((m) => m.name === 'activeRewardTokens'),
      chain: chain,
    });

    const rewardTokenAddresses = activeRewardTokensResult?.output || [];
    
    if (rewardTokenAddresses.length === 0 || poolTVLUsd === 0) {
      return 0;
    }

    let totalAPR = 0;

    // Calculate APR for each reward token
    for (const rewardTokenAddress of rewardTokenAddresses) {
      try {
        // Get reward data (contains rate per second)
        const rewardDataResult = await sdk.api.abi.call({
          target: poolAddress,
          abi: STABILITY_POOL_ABI.find((m) => m.name === 'rewardData'),
          params: [rewardTokenAddress],
          chain: chain,
        });

        if (!rewardDataResult?.output) continue;

        const rewardRateBigInt = BigInt(rewardDataResult.output[2] || 0); // rate is at index 2
        const finishAt = Number(rewardDataResult.output[1] || 0); // finishAt is at index 1
        const currentTime = Math.floor(Date.now() / 1000);

        // Check if reward period is still active
        if (finishAt > 0 && currentTime > finishAt) {
          continue; // Reward period has ended
        }

        if (rewardRateBigInt === 0n) continue;

        // Convert BigInt to BigNumber immediately to preserve precision
        const rewardRate = new BigNumber(rewardRateBigInt.toString());

        // Fetch reward token decimals
        let rewardTokenDecimals = 18; // Default to 18 decimals
        try {
          const decimalsResult = await sdk.api.abi.call({
            target: rewardTokenAddress,
            abi: ERC20_ABI.find((m) => m.name === 'decimals'),
            chain: chain,
          });
          rewardTokenDecimals = Number(decimalsResult?.output || 18);
        } catch (error) {
          // If decimals call fails, use default 18
          console.warn(`Failed to fetch decimals for reward token ${rewardTokenAddress}, using default 18`);
        }

        // Get reward token price from coins API
        let rewardTokenPrice = 0;
        try {
          const priceResponse = await axios.get(
            `https://coins.llama.fi/prices/current/${chain}:${rewardTokenAddress}`,
            { timeout: 10000 } // 10 second timeout
          );
          const priceKey = Object.keys(priceResponse.data.coins || {}).find(
            key => key.toLowerCase() === `${chain}:${rewardTokenAddress.toLowerCase()}`
          );
          rewardTokenPrice = priceResponse.data.coins[priceKey]?.price || 0;
        } catch (error) {
          // If price not found, skip this reward token
          continue;
        }

        if (rewardTokenPrice === 0) continue;

        // Calculate annual rewards in USD using BigNumber for precision
        // rewardRate is in token units per second (with token decimals)
        // Divide by 10**decimals first to get tokens per second, then multiply by SECONDS_PER_YEAR
        const rewardTokensPerSecond = rewardRate.dividedBy(10 ** rewardTokenDecimals);
        const rewardTokensPerYear = rewardTokensPerSecond.multipliedBy(SECONDS_PER_YEAR);
        const rewardValuePerYearUSD = rewardTokensPerYear.multipliedBy(rewardTokenPrice);

        // Calculate APR for this reward token (convert to Number only at the end)
        const tokenAPR = rewardValuePerYearUSD.dividedBy(poolTVLUsd).multipliedBy(100).toNumber();
        totalAPR += tokenAPR;
      } catch (error) {
        // Skip this reward token if there's an error
        continue;
      }
    }

    return totalAPR;
  } catch (error) {
    console.error(`Error calculating APR from rewards for pool ${poolAddress}:`, error.message);
    return 0;
  }
}

/**
 * Fetch pool data from on-chain contracts using reward streaming data
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
      let peggedTokenPriceInUnderlying = 0;
      let underlyingAssetPriceUSD = 0;
      let decimals = 18;
      
      // Get underlying asset price from Chainlink
      // Determine which Chainlink feed to use based on token symbol
      const chainlinkFeedKey = TOKEN_CHAINLINK_FEED_MAP[peggedTokenSymbol];
      if (!chainlinkFeedKey || !CHAINLINK_FEEDS[chainlinkFeedKey]) {
        throw new Error(`Unsupported pegged token symbol: ${peggedTokenSymbol}. Supported symbols: ${Object.keys(TOKEN_CHAINLINK_FEED_MAP).join(', ')}`);
      }
      const chainlinkFeedAddress = CHAINLINK_FEEDS[chainlinkFeedKey];
      
      // Get pegged token price in underlying asset from minter
      for (const market of tokenMarkets) {
        if (market.minterAddress && peggedTokenPriceInUnderlying === 0) {
          try {
            const minterPriceResult = await sdk.api.abi.call({
              target: market.minterAddress,
              abi: MINTER_ABI.find((m) => m.name === 'peggedTokenPrice'),
              chain: CHAIN,
            });
            if (minterPriceResult?.output) {
              peggedTokenPriceInUnderlying = Number(minterPriceResult.output) / 1e18;
              console.log(`  peggedTokenPrice from minter: ${peggedTokenPriceInUnderlying.toFixed(6)} ${UNDERLYING_ASSET_DISPLAY[peggedTokenSymbol] || 'UNDERLYING'}`);
              break;
            }
          } catch (error) {
            continue;
          }
        }
      }
      
      // If minter call failed, assume 1:1 peg
      if (peggedTokenPriceInUnderlying === 0) {
        peggedTokenPriceInUnderlying = 1;
        console.log(`  Using default peg ratio: 1.0 ${UNDERLYING_ASSET_DISPLAY[peggedTokenSymbol] || 'UNDERLYING'}`);
      }
      
      // Get underlying asset (BTC/ETH) price in USD from Chainlink
      try {
        const chainlinkPriceResult = await sdk.api.abi.call({
          target: chainlinkFeedAddress,
          abi: CHAINLINK_ABI.find((m) => m.name === 'latestAnswer'),
          chain: CHAIN,
        });
        if (chainlinkPriceResult?.output) {
          // Chainlink prices are in 8 decimals for USD pairs
          underlyingAssetPriceUSD = Number(chainlinkPriceResult.output) / 1e8;
          if (underlyingAssetPriceUSD > 0) {
            console.log(`  ${UNDERLYING_ASSET_DISPLAY[peggedTokenSymbol] || 'UNDERLYING'} price in USD: $${underlyingAssetPriceUSD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
          }
        }
      } catch (error) {
        console.log(`  Failed to get ${UNDERLYING_ASSET_DISPLAY[peggedTokenSymbol] || 'UNDERLYING'} price from Chainlink:`, error.message);
      }
      
      // Calculate final USD price per token
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
      
      // Process each market for this token
      for (const market of tokenMarkets) {
        const { collateralPoolAddress, sailPoolAddress } = market;
        
        try {
          console.log(`Fetching data for ${peggedTokenSymbol} market - Collateral: ${collateralPoolAddress}, Sail: ${sailPoolAddress}`);
          
          // Get haToken amounts deposited in stability pools
          const [
            collateralTVLResult,
            sailTVLResult,
          ] = await Promise.all([
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
          ]);
          
          // Calculate TVL values using BigNumber for precision
          const collateralTVLRaw = BigInt(collateralTVLResult?.output || 0);
          const sailTVLRaw = BigInt(sailTVLResult?.output || 0);
          
          // Convert BigInt to BigNumber and perform division
          const collateralTVLTokensBN = new BigNumber(collateralTVLRaw.toString()).dividedBy(10 ** decimals);
          const sailTVLTokensBN = new BigNumber(sailTVLRaw.toString()).dividedBy(10 ** decimals);
          
          // Convert to Number after BigNumber operations
          const collateralTVLTokens = collateralTVLTokensBN.toNumber();
          const sailTVLTokens = sailTVLTokensBN.toNumber();
          const collateralTVLUsd = collateralTVLTokens * peggedTokenPriceUSD;
          const sailTVLUsd = sailTVLTokens * peggedTokenPriceUSD;
          
          // Calculate APR from reward streaming data
          let collateralAPR = 0;
          let sailAPR = 0;
          
          if (collateralTVLUsd > 0) {
            collateralAPR = await calculateAPRFromRewards(collateralPoolAddress, collateralTVLUsd, CHAIN);
          }
          
          if (sailTVLUsd > 0 && sailPoolAddress) {
            sailAPR = await calculateAPRFromRewards(sailPoolAddress, sailTVLUsd, CHAIN);
          }
          
          // Calculate market TVL from haTokens deposited in stability pools
          // Use BigNumber.plus for summing BigInt values
          const totalTVLRawBN = new BigNumber(collateralTVLRaw.toString()).plus(sailTVLRaw.toString());
          const marketTVLTokensBN = totalTVLRawBN.dividedBy(10 ** decimals);
          const marketTVLTokens = marketTVLTokensBN.toNumber();
          const marketTVLUsd = marketTVLTokens * peggedTokenPriceUSD;
          totalTVL += marketTVLUsd;
          
          // Calculate market APR: take the lowest between collateral and sail APR
          // Include 0% APR when TVL > 0 (0% is a valid APR when there's TVL but no rewards)
          const marketAPRs = [];
          if (collateralTVLUsd > 0) marketAPRs.push(collateralAPR); // include 0
          if (sailPoolAddress && sailTVLUsd > 0) marketAPRs.push(sailAPR); // include 0
          
          const marketAPR = marketAPRs.length > 0 ? Math.min(...marketAPRs) : 0;
          
          // Collect APR for minimum calculation across all markets (include 0 if TVL exists)
          if (marketTVLUsd > 0) allAPRs.push(marketAPR);
          
          console.log(`  Market TVL: ${marketTVLTokens.toFixed(6)} haTokens = $${marketTVLUsd.toFixed(2)} USD`);
          console.log(`    - Collateral Pool: ${collateralTVLTokens.toFixed(6)} haTokens ($${collateralTVLUsd.toFixed(2)})${collateralAPR > 0 ? ` - APR: ${collateralAPR.toFixed(2)}%` : ''}`);
          console.log(`    - Sail Pool: ${sailTVLTokens.toFixed(6)} haTokens ($${sailTVLUsd.toFixed(2)})${sailAPR > 0 ? ` - APR: ${sailAPR.toFixed(2)}%` : ''}`);
          
          if (marketAPR > 0) {
            const usedAPR = marketAPRs.length === 2 && collateralAPR < sailAPR ? 'collateral (lowest)' : 
                           marketAPRs.length === 2 && sailAPR < collateralAPR ? 'sail (lowest)' :
                           marketAPRs.length === 1 ? (collateralAPR >= 0 ? 'collateral' : 'sail') : 'none';
            console.log(`  Market APR: ${marketAPR.toFixed(2)}% (using ${usedAPR} APR)`);
          } else {
            console.log(`  Market APR: 0.00% (no active rewards)`);
          }
      
          // no marker needed; 0% is a real value when TVL exists
          
        } catch (error) {
          console.error(`  Error fetching pools for ${peggedTokenSymbol} market:`, error.message || error);
        }
      }
      
      // Filter to valid finite APR values (0% is valid when TVL exists)
      const validAPRs = allAPRs.filter((apr) => Number.isFinite(apr));
      
      // Use the lowest APR from all markets for this token
      const finalAPR = validAPRs.length > 0 ? Math.min(...validAPRs) : 0;
      
      console.log(`\n${peggedTokenSymbol} Summary:`);
      console.log(`  Total TVL: $${totalTVL.toFixed(2)} (from haTokens deposited in stability pools)`);
      console.log(`  Final APR: ${finalAPR.toFixed(2)}% (from ${validAPRs.length} market(s))`);
      
      // Create pool entry for this token
      // Return pool only if TVL >= $10k (DefiLlama minimum threshold)
      if (totalTVL >= 10000) {
        pools.push({
          pool: `${peggedTokenAddress}-${CHAIN}`.toLowerCase(),
          chain: utils.formatChain(CHAIN),
          project: 'harbor',
          symbol: peggedTokenSymbol,
          tvlUsd: totalTVL,
          apyBase: validAPRs.length > 0 ? finalAPR : 0,
          underlyingTokens: UNDERLYING_ASSETS[peggedTokenSymbol] ? [UNDERLYING_ASSETS[peggedTokenSymbol]] : [peggedTokenAddress],
          poolMeta: `${peggedTokenSymbol} Stability Pool`,
          url: 'https://app.harborfinance.io/anchor',
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

const apy = async () => {
  const pools = await fetchPoolsFromChain();
  return pools.filter((p) => p && utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.harborfinance.io/anchor',
};
