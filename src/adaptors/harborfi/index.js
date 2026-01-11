const axios = require('axios');
const sdk = require('@defillama/sdk');
const utils = require('../utils');

/**
 * HarborFi Adapter
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

// On-chain contract addresses
// Markets are grouped by pegged token (haETH, haBTC)
const MARKETS = [
  // haETH markets
  {
    peggedTokenSymbol: 'haETH',
    peggedTokenAddress: '0x7A53EBc85453DD006824084c4f4bE758FcF8a5B5',
    collateralPoolAddress: '0x1F985CF7C10A81DE1940da581208D2855D263D72', // ETH/fxUSD Anchor Pool
    sailPoolAddress: '0x438B29EC7a1770dDbA37D792F1A6e76231Ef8E06', // ETH/fxUSD Sail Pool
    minterAddress: '0xd6E2F8e57b4aFB51C6fA4cbC012e1cE6aEad989F',
  },
  // haBTC markets
  {
    peggedTokenSymbol: 'haBTC',
    peggedTokenAddress: '0x25bA4A826E1A1346dcA2Ab530831dbFF9C08bEA7',
    collateralPoolAddress: '0x86561cdB34ebe8B9abAbb0DD7bEA299fA8532a49', // BTC/fxUSD Anchor Pool
    sailPoolAddress: '0x9e56F1E1E80EBf165A1dAa99F9787B41cD5bFE40', // BTC/fxUSD Sail Pool
    minterAddress: '0x33e32ff4d0677862fa31582CC654a25b9b1e4888',
  },
  {
    peggedTokenSymbol: 'haBTC',
    peggedTokenAddress: '0x25bA4A826E1A1346dcA2Ab530831dbFF9C08bEA7',
    collateralPoolAddress: '0x667Ceb303193996697A5938cD6e17255EeAcef51', // BTC/stETH Anchor Pool
    sailPoolAddress: '0xCB4F3e21DE158bf858Aa03E63e4cEc7342177013', // BTC/stETH Sail Pool
    minterAddress: '0xF42516EB885E737780EB864dd07cEc8628000919',
  },
];

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

// Chainlink price feed addresses on Ethereum mainnet
const CHAINLINK_FEEDS = {
  ETH_USD: '0x5f4eC3Df9cbd43714FE2740f5E3616155c5b8419',
  BTC_USD: '0xF4030086522a5bEEa4988F8cA5B36dbC97BeE88c',
};

const SECONDS_PER_YEAR = 365 * 24 * 60 * 60; // 31,536,000

/**
 * Calculate APR from reward streaming data
 * APR = (rewardRate * SECONDS_PER_YEAR / 1e18) * tokenPrice / TVL * 100
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

        const rewardRate = BigInt(rewardDataResult.output[2] || 0); // rate is at index 2
        const finishAt = Number(rewardDataResult.output[1] || 0); // finishAt is at index 1
        const currentTime = Math.floor(Date.now() / 1000);

        // Check if reward period is still active
        if (finishAt > 0 && currentTime > finishAt) {
          continue; // Reward period has ended
        }

        if (rewardRate === 0n) continue;

        // Get reward token price from coins API
        let rewardTokenPrice = 0;
        try {
          const priceResponse = await axios.get(
            `https://coins.llama.fi/prices/current/${chain}:${rewardTokenAddress}`
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

        // Calculate annual rewards in USD
        // rewardRate is in wei per second (18 decimals)
        const rewardRatePerYear = Number(rewardRate) * SECONDS_PER_YEAR;
        const rewardTokensPerYear = rewardRatePerYear / 1e18;
        const rewardValuePerYearUSD = rewardTokensPerYear * rewardTokenPrice;

        // Calculate APR for this reward token
        const tokenAPR = (rewardValuePerYearUSD / poolTVLUsd) * 100;
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
      const chainlinkFeedAddress = peggedTokenSymbol === 'haBTC' 
        ? CHAINLINK_FEEDS.BTC_USD
        : CHAINLINK_FEEDS.ETH_USD;
      
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
              console.log(`  peggedTokenPrice from minter: ${peggedTokenPriceInUnderlying.toFixed(6)} ${peggedTokenSymbol === 'haBTC' ? 'BTC' : 'ETH'}`);
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
        console.log(`  Using default peg ratio: 1.0 ${peggedTokenSymbol === 'haBTC' ? 'BTC' : 'ETH'}`);
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
            console.log(`  ${peggedTokenSymbol === 'haBTC' ? 'BTC' : 'ETH'} price in USD: $${underlyingAssetPriceUSD.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}`);
          }
        }
      } catch (error) {
        console.log(`  Failed to get ${peggedTokenSymbol === 'haBTC' ? 'BTC' : 'ETH'} price from Chainlink:`, error.message);
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
          
          // Calculate TVL values
          const collateralTVLRaw = BigInt(collateralTVLResult?.output || 0);
          const sailTVLRaw = BigInt(sailTVLResult?.output || 0);
          const collateralTVLTokens = Number(collateralTVLRaw) / (10 ** decimals);
          const sailTVLTokens = Number(sailTVLRaw) / (10 ** decimals);
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
          
          // Calculate market APR: take the lowest between collateral and sail APR
          const marketAPRs = [];
          if (collateralAPR > 0 && collateralTVLUsd > 0) {
            marketAPRs.push(collateralAPR);
          }
          if (sailAPR > 0 && sailTVLUsd > 0) {
            marketAPRs.push(sailAPR);
          }
          
          const marketAPR = marketAPRs.length > 0 ? Math.min(...marketAPRs) : 0;
          
          // Collect APR for minimum calculation across all markets
          if (marketAPR > 0) {
            allAPRs.push(marketAPR);
          }
          
          // Calculate market TVL from haTokens deposited in stability pools
          const totalTVLRaw = collateralTVLRaw + sailTVLRaw;
          const marketTVLTokens = Number(totalTVLRaw) / (10 ** decimals);
          const marketTVLUsd = marketTVLTokens * peggedTokenPriceUSD;
          totalTVL += marketTVLUsd;
          
          console.log(`  Market TVL: ${marketTVLTokens.toFixed(6)} haTokens = $${marketTVLUsd.toFixed(2)} USD`);
          console.log(`    - Collateral Pool: ${collateralTVLTokens.toFixed(6)} haTokens ($${collateralTVLUsd.toFixed(2)})${collateralAPR > 0 ? ` - APR: ${collateralAPR.toFixed(2)}%` : ''}`);
          console.log(`    - Sail Pool: ${sailTVLTokens.toFixed(6)} haTokens ($${sailTVLUsd.toFixed(2)})${sailAPR > 0 ? ` - APR: ${sailAPR.toFixed(2)}%` : ''}`);
          
          if (marketAPR > 0) {
            const usedAPR = marketAPRs.length === 2 && collateralAPR < sailAPR ? 'collateral (lowest)' : 
                           marketAPRs.length === 2 && sailAPR < collateralAPR ? 'sail (lowest)' :
                           marketAPRs.length === 1 ? (collateralAPR > 0 ? 'collateral' : 'sail') : 'none';
            console.log(`  Market APR: ${marketAPR.toFixed(2)}% (using ${usedAPR} APR)`);
          } else {
            console.log(`  Market APR: 0.00% (no active rewards)`);
          }
      
          // Track if we have any TVL data but no APR
          if (marketTVLUsd > 0 && marketAPR === 0) {
            allAPRs.push(-1); // Marker that we have TVL data but no APR
          }
          
        } catch (error) {
          console.error(`  Error fetching pools for ${peggedTokenSymbol} market:`, error.message || error);
        }
      }
      
      // Filter out the TVL marker (-1) and calculate final APR
      const validAPRs = allAPRs.filter(apr => apr >= 0);
      
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
          project: 'harborfi',
          symbol: peggedTokenSymbol,
          tvlUsd: totalTVL,
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

const apy = async () => {
  const pools = await fetchPoolsFromChain();
  return pools.filter((p) => p && utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.harborfinance.io',
};
