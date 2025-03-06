 





const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const utils = require('../utils');

// Define supported chains and their subgraph endpoints
const chains = {
  ethereum: sdk.graph.modifyEndpoint(
    'x6qJPkv7FaCWkfcjDWx12Z2NEfsvCCwuy87vQzk9zRh' 
  ),
  // Add more chains as needed
};

// Query to get current pool metrics
const query = gql`
  query GetPoolMetrics($block: Block_height) {
    groupPoolMetrics(first: 1000, block: $block) {
      id
      group_pool_address
      principal_token_address
      collateral_token_address
      market_id
      total_principal_tokens_committed
      total_principal_tokens_borrowed
      total_interest_collected
      total_principal_tokens_repaid
      total_collateral_tokens_escrowed
      interest_rate_upper_bound
      interest_rate_lower_bound
    }
  }
`;

// Query to get historical pool metrics for APY calculation
const queryPrior = gql`
  query GetPriorPoolMetrics($block: Block_height) {
    groupPoolMetrics(first: 1000, block: $block) {
      id
      group_pool_address
      total_principal_tokens_committed
      total_principal_tokens_borrowed
      total_interest_collected
    }
  }
`;

// Function to fetch token info (symbols and decimals)
const fetchTokenInfo = async (tokenAddresses, chainString) => {
  const tokens = {};
  
  for (const address of tokenAddresses) {
    try {
      // Use SDK to get token info
      const tokenInfo = await sdk.api.erc20.info(address, chainString);
      tokens[address.toLowerCase()] = {
        symbol: tokenInfo.output.symbol,
        decimals: parseInt(tokenInfo.output.decimals) || 18 // Default to 18 if not available
      };
    } catch (error) {
      // Default values if fetching fails
      tokens[address.toLowerCase()] = {
        symbol: 'UNKNOWN',
        decimals: 18
      };
    }
  }
  
  return tokens;
};

const topLvl = async (
  chainString,
  url,
  query,
  queryPrior,
  timestamp
) => {
  // Get blocks for current, 24h ago, and 7d ago timestamps
  const [block, blockPrior] = await utils.getBlocks(chainString, timestamp, [url]);
  const [_, blockPrior7d] = await utils.getBlocks(chainString, timestamp, [url], 604800);
  
  // Pull current data
  let dataNow = await request(url, query, { 
    block: block ? { number: parseInt(block) } : null 
  });
  dataNow = dataNow.groupPoolMetrics;
  
  // Pull 24h offset data
  let dataPrior = await request(url, queryPrior, { 
    block: blockPrior ? { number: parseInt(blockPrior) } : null 
  });
  dataPrior = dataPrior.groupPoolMetrics;
  
 
  // Get unique token addresses
  const tokenAddresses = new Set();
  dataNow.forEach(pool => {
    tokenAddresses.add(pool.principal_token_address);
    tokenAddresses.add(pool.collateral_token_address);
  });
  
  // Fetch token info (symbols and decimals)
  const tokenInfo = await fetchTokenInfo(Array.from(tokenAddresses), chainString);
  
  // Calculate TVL and APY
  const enrichedData = await Promise.all(
    dataNow.map(async (pool) => {
      // Get token prices
      const { pricesByAddress } = await utils.getPrices(
        [pool.principal_token_address], 
        chainString
      );
      
      // Get principal token decimals
      const principalTokenDecimals = tokenInfo[pool.principal_token_address.toLowerCase()]?.decimals || 18;
      const principalTokenDivisor = 10 ** principalTokenDecimals;
      
      // Calculate TVL in USD using the correct token decimals
      const tvlUsd = parseInt(pool.total_principal_tokens_committed) * 
        parseFloat(pricesByAddress[pool.principal_token_address.toLowerCase()] || 0) / principalTokenDivisor;
      
      // Find prior data for APY calculations
      const prior24h = dataPrior.find(p => p.id === pool.id);
     // const prior7d = dataPrior7d.find(p => p.id === pool.id);
      
      // Calculate pool utilization rate
      const totalCommitted = parseInt(pool.total_principal_tokens_committed);
      const totalBorrowed = parseInt(pool.total_principal_tokens_borrowed);
      
      // Calculate utilization (clamped between 0 and 1)
      const poolBorrowedPercent = totalCommitted > 0 ? 
        Math.min(Math.max(totalBorrowed / totalCommitted, 0), 1) : 0;
      
      // Get interest rate bounds and ensure they're numbers
      // If not available in the subgraph, use fallback values (5% to 15%)
      const interestRateLowerBound = parseInt(pool.interest_rate_lower_bound) || 500;  // 5% in basis points
      const interestRateUpperBound = parseInt(pool.interest_rate_upper_bound) || 1500; // 15% in basis points
       
      // Calculate APY using our calculateActiveYield function
      const apyBase = calculateActiveYield(
        poolBorrowedPercent,
        interestRateLowerBound,
        interestRateUpperBound
      ); 
 
      
      // Get token symbols from our token info
      const principalSymbol = tokenInfo[pool.principal_token_address.toLowerCase()]?.symbol || 'UNKNOWN';
      const collateralSymbol = tokenInfo[pool.collateral_token_address.toLowerCase()]?.symbol || 'UNKNOWN';
      
      // Also get token decimals for later use
      const collateralTokenDecimals = tokenInfo[pool.collateral_token_address.toLowerCase()]?.decimals || 18;
      
      // Log token decimals for debugging
      console.log(`Token decimals for pool ${pool.group_pool_address}: Principal=${principalTokenDecimals}, Collateral=${collateralTokenDecimals}`);
      
      return {
        ...pool,
        tvlUsd,
        apyBase,
   
        principalSymbol,
        collateralSymbol,
        principalTokenDecimals,
        collateralTokenDecimals
      };
    })
  );
  
  return enrichedData.map((p) => {
    const symbol = `${p.collateralSymbol}-${p.principalSymbol}`;
    const underlyingTokens = [p.principal_token_address, p.collateral_token_address];
    const chain = chainString === 'ethereum' ? 'mainnet' : chainString;
    const url = `https://app.teller.org/${chainString}/lend/pool/${p.group_pool_address}`;


    return {
      pool: p.group_pool_address,
      chain: utils.formatChain(chainString),
      project: 'teller',
      symbol,
      tvlUsd: p.tvlUsd,
      apy: p.apyBase, // Already in percentage format from our calculation 
      underlyingTokens,
      url,
      // Adding other metrics that might be useful - using the correct token decimals
      totalBorrowUsd: parseInt(p.total_principal_tokens_borrowed) / (10 ** p.principalTokenDecimals),
    //  totalRepaid: parseInt(p.total_principal_tokens_repaid) / (10 ** p.principalTokenDecimals),
    //  totalCollateral: parseInt(p.total_collateral_tokens_escrowed) / (10 ** p.collateralTokenDecimals)
    };
  });
};

 


// Function to calculate active yield based on pool utilization and interest rate bounds
// Converted from Rust to JavaScript
const calculateActiveYield = (poolBorrowedPercent, interestRateLowerBound, interestRateUpperBound) => {
  let poolYieldRaw;
  
  if (poolBorrowedPercent === 0) {
    // If nothing is borrowed, yield is at minimum
    poolYieldRaw = interestRateLowerBound;
  } else if (poolBorrowedPercent === 1) {
    // If fully utilized, yield is at maximum
    poolYieldRaw = interestRateUpperBound;
  } else {
    // Linear interpolation between lower and upper bounds based on utilization
    const lowerBound = interestRateLowerBound;
    const upperBound = interestRateUpperBound;
    const range = upperBound - lowerBound;
    
    // Calculate yield: lower_bound + (utilization * range)
    poolYieldRaw = lowerBound + (poolBorrowedPercent * range);
  }

  // Scale from basis points (0.01%) to percentage
  const poolYieldScaled = poolYieldRaw / 100;
  
  // Scale by utilization
  const activeYieldScaled = poolYieldScaled * poolBorrowedPercent;

  return activeYieldScaled;
}




const main = async (timestamp = null) => {
  let data = [];
  for (const [chain, url] of Object.entries(chains)) {
    try {
      console.log(`Fetching data for ${chain}...`);
      const chainData = await topLvl(
        chain,
        url,
        query,
        queryPrior,
        timestamp
      );
      data.push(...chainData);
    } catch (err) {
      console.log(chain, err);
    }
  }
  
  const filteredData = data.filter((p) => utils.keepFinite(p));
  
  
  
  return filteredData;
};

module.exports = {
  timetravel: false,
  apy: main,
};