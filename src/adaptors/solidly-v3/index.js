const utils = require('../utils');
const sdk = require('@defillama/sdk');
const ethers = require('ethers');
const {
  fetchPools,
  fetchPrices,
  getBlock24hAgo,
  getPoolStateChanges,
  getSolid,
  bnToFloat,
} = require('./queries.js');

const ZERO = ethers.BigNumber.from(0);
const SUPPORTED_CHAINS = ['ethereum', 'base', 'arbitrum', 'optimism', 'fantom', 'sonic'];

/**
 * Determines the input token during a swap
 */
function getPoolInput(pool, swapData) {
  const price = Math.abs(
    ethers.FixedNumber.from(swapData.amount1.toString())
      .divUnsafe(ethers.FixedNumber.from(swapData.amount0.toString()))
      .toUnsafeFloat()
  );
  
  if (swapData.amount0.gt(ZERO)) {
    return { 
      token: pool.token0.id.toLowerCase(), 
      input: swapData.amount0, 
      price 
    };
  } else {
    return { 
      token: pool.token1.id.toLowerCase(), 
      input: swapData.amount1, 
      price 
    };
  }
}

/**
 * Converts token amount to decimal based on token decimals
 */
function convertTokenToDecimal(tokenAmount, decimals) {
  if (!tokenAmount) return 0;
  return parseFloat(tokenAmount) / Math.pow(10, decimals);
}

/**
 * Fetches actual token balances from the blockchain
 */
async function getActualPoolBalances(pool, chain) {
  try {
    const [token0Balance, token1Balance] = await Promise.all([
      sdk.api.erc20.balanceOf({
        target: pool.token0.id,
        owner: pool.id,
        chain
      }),
      sdk.api.erc20.balanceOf({
        target: pool.token1.id,
        owner: pool.id,
        chain
      })
    ]);
    
    const t0Amount = convertTokenToDecimal(
      token0Balance.output, 
      parseInt(pool.token0.decimals)
    );
    
    const t1Amount = convertTokenToDecimal(
      token1Balance.output,
      parseInt(pool.token1.decimals)
    );
    
    return { token0: t0Amount, token1: t1Amount };
  } catch (error) {
    console.error(`Error fetching balances for pool ${pool.id}:`, error);
    return null;
  }
}

/**
 * Process a single pool to calculate its APY metrics
 */
async function processPool(pool, prices, blockStart, chain) {
  // Get fee changes and swap events
  let { begin_fee, state_changes } = await getPoolStateChanges(
    pool.id,
    blockStart,
    chain
  );
  
  let currentFee = begin_fee;
  let feePerToken = {
    [pool.token0.id.toLowerCase()]: ZERO,
    [pool.token1.id.toLowerCase()]: ZERO
  };

  for (const event of state_changes) {
    if (event.event === 'Swap') {
      const poolInput = getPoolInput(pool, event.args);
      const swapFee = poolInput.input
        .mul(currentFee)
        .div(ethers.BigNumber.from(1_000_000));

      feePerToken[poolInput.token] = feePerToken[poolInput.token].add(swapFee);
    } else if (event.event === 'SetFee') {
      currentFee = ethers.BigNumber.from(event.args.feeNew);
    }
  }

  // Calculate total fees in USD
  let totalFeeUsd = 0;
  for (const [token, fee] of Object.entries(feePerToken)) {
    const tokenPrice = prices[token];
    if (tokenPrice) {
      // Get decimals from pool data
      const tokenDecimals = token === pool.token0.id.toLowerCase() 
        ? parseInt(pool.token0.decimals) 
        : parseInt(pool.token1.decimals);
      
      const feeUsd = bnToFloat(fee, tokenDecimals) * tokenPrice.price;
      totalFeeUsd += feeUsd;
    }
  }

  // Calculate rewards
  const solid = getSolid(chain);
  const solidPerYearUsd = solid && prices[solid] ? 
    bnToFloat(pool.solid_per_year, 18) * prices[solid].price : 0;
  
  const rewardTokens = [];
  let apyReward = 0;
  let apyBase = 0;
  let apySolid = 0;
  
  if (pool.tvl > 0) {
    // 20% goes to protocol, 80% to LPs
    apyBase = (totalFeeUsd / pool.tvl) * 365 * 100 * 0.8;
    apySolid = solid && prices[solid] ? (solidPerYearUsd / pool.tvl) * 100 : 0;
    
    if (apySolid > 0) {
      apyReward += apySolid;
      rewardTokens.push(solid);
    }
    
    // Add other emissions
    for (const emission of pool.emissions_per_year) {
      if (emission.token in prices) {
        // Default to 18 decimals for emission tokens not in the pool
        let emissionDecimals = 18;
        
        // Try to get decimals from pool tokens if it's one of them
        if (emission.token.toLowerCase() === pool.token0.id.toLowerCase()) {
          emissionDecimals = parseInt(pool.token0.decimals);
        } else if (emission.token.toLowerCase() === pool.token1.id.toLowerCase()) {
          emissionDecimals = parseInt(pool.token1.decimals);
        }
        
        const perYearUsd = bnToFloat(emission.per_year, emissionDecimals) * prices[emission.token].price;
        const emissionApy = (perYearUsd / pool.tvl) * 100;
        apyReward += emissionApy;
        rewardTokens.push(emission.token);
      }
    }
  }
  
  // Make sure to use the tokens' actual symbols from the original data
  const token0Symbol = pool.token0.symbol || 'unknown';
  const token1Symbol = pool.token1.symbol || 'unknown';
  
  return {
    pool: `${chain}:${pool.id}`, // we have duplicated pools across chains because of deterministic addresses
    chain,
    project: 'solidly-v3',
    symbol: `${token0Symbol}-${token1Symbol}`,
    tvlUsd: pool.tvl,
    apyBase,
    apyReward,
    rewardTokens: [...new Set(rewardTokens)],
    url: `https://solidly.com/liquidity/manage/${pool.id}/`,
    underlyingTokens: [pool.token0.id, pool.token1.id],
  };
}

/**
 * Process pools for a specific chain
 */
async function processChain(chain, timestamp) {
  const blockStart = await getBlock24hAgo(timestamp, chain);
  const { pools, touched_tokens } = await fetchPools(timestamp, chain);
  const prices = await fetchPrices(touched_tokens, chain);
  
  // Filter pools with available price data
  const poolsWithPrices = pools.filter(pool => {
    const t0 = pool.token0.id.toLowerCase();
    const t1 = pool.token1.id.toLowerCase();
    return (t0 in prices) && (t1 in prices);
  });
  
  // Enrich pools with additional data
  const enrichedPools = await Promise.all(
    poolsWithPrices.map(async (pool) => {
      const t0 = pool.token0.id.toLowerCase();
      const t1 = pool.token1.id.toLowerCase();
      
      // Just store price information
      pool.t0 = { price: prices[t0].price };
      pool.t1 = { price: prices[t1].price };
      
      // Get actual balances from blockchain
      const actualBalances = await getActualPoolBalances(pool, chain);
      
      if (actualBalances) {
        pool.t0_usd = actualBalances.token0 * pool.t0.price;
        pool.t1_usd = actualBalances.token1 * pool.t1.price;
      } else {
        // Fallback to subgraph data
        const t0Amount = convertTokenToDecimal(
          pool.totalValueLockedToken0,
          parseInt(pool.token0.decimals)
        );
        const t1Amount = convertTokenToDecimal(
          pool.totalValueLockedToken1,
          parseInt(pool.token1.decimals)
        );
        pool.t0_usd = t0Amount * pool.t0.price;
        pool.t1_usd = t1Amount * pool.t1.price;
      }
      
      pool.tvl = pool.t0_usd + pool.t1_usd;
      return pool;
    })
  );

  // Calculate APY for each pool
  const poolsWithApy = await Promise.all(
    enrichedPools.map(pool => processPool(pool, prices, blockStart, chain))
  );

  return poolsWithApy;
}

/**
 * Main function to calculate APY for all supported chains
 */
async function main(timestamp = null) {
  timestamp = timestamp || Math.floor(Date.now() / 1000);
  
  try {
    // Process all chains in parallel
    const chainResults = await Promise.all(
      SUPPORTED_CHAINS.map(chain => processChain(chain, timestamp))
    );
    
    // Combine and filter results
    return chainResults.flat().filter(p => utils.keepFinite(p));
  } catch (error) {
    console.error('Error processing chains:', error);
    return [];
  }
}

module.exports = {
  timetravel: true,
  apy: main,
};