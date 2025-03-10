



/*

totalSupplyUSD = total supplied collateral (independent of whats being borrowed),
 tvlUsd = totalSupplyUSD - totalBorrowUSD

*/
 

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




/*

DEV NOTES 

  Ideally upgrade subgraph in the future to include excessivePrincipalTokensRepaid  but very minor delta for now 

*/
 


// Query to get current pool metrics
const query = gql`
  query GetPoolMetrics($block: Block_height) {
    groupPoolMetrics(first: 1000, block: $block) {
      id
      group_pool_address
      principal_token_address
      collateral_token_address
      shares_token_address
      market_id
      total_principal_tokens_committed
      total_principal_tokens_withdrawn
      total_principal_tokens_borrowed
      total_interest_collected 
      token_difference_from_liquidations
      total_principal_tokens_repaid
      total_collateral_tokens_escrowed
      total_collateral_withdrawn
      interest_rate_upper_bound
      interest_rate_lower_bound
      liquidity_threshold_percent
      collateral_ratio

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
 // queryPrior,
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
        [pool.principal_token_address, pool.collateral_token_address], 
        chainString
      );
      
      // Get principal token decimals
      const principalTokenDecimals = tokenInfo[pool.principal_token_address.toLowerCase()]?.decimals || 18;
      const principalTokenDivisor = 10 ** principalTokenDecimals;
        
      const collateralTokenDecimals = tokenInfo[pool.collateral_token_address.toLowerCase()]?.decimals || 18;
      const collateralTokenDivisor = 10 ** collateralTokenDecimals;
      

 


      const totalCollateralEscrowedNet =  parseInt(pool.total_collateral_tokens_escrowed) - parseInt(pool.total_collateral_withdrawn); 

      const totalSupplyUsd = totalCollateralEscrowedNet * 
        parseFloat(pricesByAddress[pool.collateral_token_address.toLowerCase()] || 0) / collateralTokenDivisor;
        





      const totalTokensActivelyBorrowed = parseInt(pool.total_principal_tokens_borrowed) - parseInt(pool.total_principal_tokens_repaid);
      const totalTokensActivelyCommitted =  parseInt(pool.total_principal_tokens_committed) - parseInt(pool.total_principal_tokens_withdrawn);
 


      const totalInterestCollected = parseInt(pool.total_interest_collected);
      const tokenDifferenceFromLiquidatons = parseInt(pool.token_difference_from_liquidations);

        

          
      // Calculate pool utilization rate
      const totalCommitted = parseInt( totalTokensActivelyCommitted  );
      const totalBorrowed = parseInt( totalTokensActivelyBorrowed );


      const totalBorrowUsd =  totalBorrowed * 
        parseFloat(pricesByAddress[pool.principal_token_address.toLowerCase()] || 0) / (10 ** principalTokenDecimals) ;
        


        const  tvlUsd = totalSupplyUsd - totalBorrowUsd ; 



      // Calculate utilization (clamped between 0 and 1)
      const poolBorrowedPercent = totalCommitted > 0 ? 
        Math.min(Math.max(totalBorrowed / totalCommitted, 0), 1) : 0;
      
      // Get interest rate bounds and ensure they're numbers
      // If not available in the subgraph, use fallback values (5% to 15%)
      const interestRateLowerBound = parseInt(pool.interest_rate_lower_bound) || 500;  // 5% in basis points
      const interestRateUpperBound = parseInt(pool.interest_rate_upper_bound) || 1500; // 15% in basis points
       
      // Calculate APY using our calculateActiveYield function
      const apyBase = calculateActiveLenderYield(
        poolBorrowedPercent,
        interestRateLowerBound,
        interestRateUpperBound
      ); 
    

      //The LTV ratio represents the maximum percentage of the collateral's value that can be borrowed by users
      const ltv =  100.0 / (parseInt( pool.collateral_ratio) / 100.0 ); 



     //  borrow apy is based on the max pool borrowed percent 
      const borrowApy = calculateActiveBorrowerYield (
          poolBorrowedPercent,
          interestRateLowerBound,
          interestRateUpperBound
        );


      
      // Get token symbols from our token info
      const principalSymbol = tokenInfo[pool.principal_token_address.toLowerCase()]?.symbol || 'UNKNOWN';
      const collateralSymbol = tokenInfo[pool.collateral_token_address.toLowerCase()]?.symbol || 'UNKNOWN';
      
      // Also get token decimals for later use
        
    


      // Log token decimals for debugging
      console.log(`Token decimals for pool ${pool.group_pool_address}: Principal=${principalTokenDecimals}, Collateral=${collateralTokenDecimals}`);
      
      return {
        ...pool,
        tvlUsd,
        apyBase,

        totalSupplyUsd,
        totalBorrowUsd, 
        ltv,
        borrowApy,
   
        principalSymbol,
        collateralSymbol,
        principalTokenDecimals,
        collateralTokenDecimals
      };
    })
  );
  
  return enrichedData.map((p) => {
   // const symbol = `${p.collateralSymbol}-${p.principalSymbol}`;

    const underlyingTokens = [p.principal_token_address, p.collateral_token_address];
    const chain = chainString === 'ethereum' ? 'mainnet' : chainString;
    const url = `https://app.teller.org/${chainString}/lend/pool/${p.group_pool_address}`;


    return {
      pool: p.group_pool_address,
      chain: utils.formatChain(chainString),
      project: 'teller',
      symbol: p.collateralSymbol, 
      mintedCoin: p.principalSymbol, 
      tvlUsd: p.tvlUsd,
      totalBorrowUsd: p.totalBorrowUsd, 
      totalSupplyUsd: p.totalSupplyUsd, 
      ltv: p.ltv, 
      apyBaseBorrow: p.borrowApy , 

      apyBase: p.apyBase, // Already in percentage format from our calculation 
      underlyingTokens,
      url,
      // Adding other metrics that might be useful - using the correct token decimals
      
    //  totalRepaid: parseInt(p.total_principal_tokens_repaid) / (10 ** p.principalTokenDecimals),
    //  totalCollateral: parseInt(p.total_collateral_tokens_escrowed) / (10 ** p.collateralTokenDecimals)
    };
  });
};

 


// Function to calculate active yield based on pool utilization and interest rate bounds
// Converted from Rust to JavaScript
const calculateActiveLenderYield = (poolBorrowedPercent, interestRateLowerBound, interestRateUpperBound) => {
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

const calculateActiveBorrowerYield = (poolBorrowedPercent, interestRateLowerBound, interestRateUpperBound) => {
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
  const activeYieldScaled = poolYieldScaled * 1.0;

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
       // queryPrior,
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