  const sdk = require('@defillama/sdk');
  const { request, gql } = require('graphql-request');
  const utils = require('../utils');

  // Supported chains and their subgraph endpoints
  const pools_v1_endpoints = {


    ethereum:  "https://subgraph.satsuma-prod.com/daba7a4f162f/teller--16564/tellerv2-pools-mainnet/api" ,//sdk.graph.modifyEndpoint('x6qJPkv7FaCWkfcjDWx12Z2NEfsvCCwuy87vQzk9zRh'),
  //   base: "https://subgraph.satsuma-prod.com/daba7a4f162f/teller--16564/tellerv2-pools-base/api",
    arbitrum: "https://subgraph.satsuma-prod.com/daba7a4f162f/teller--16564/tellerv2-pools-arbitrum/api",
    polygon: "https://subgraph.satsuma-prod.com/daba7a4f162f/teller--16564/tellerv2-pools-polygon/api",
    
  };
  const pools_v2_endpoints = {


    ethereum:  "https://subgraph.satsuma-prod.com/daba7a4f162f/teller--16564/tellerv2-poolsv2-mainnet/api" ,//sdk.graph.modifyEndpoint('x6qJPkv7FaCWkfcjDWx12Z2NEfsvCCwuy87vQzk9zRh'),
    base: "https://subgraph.satsuma-prod.com/daba7a4f162f/teller--16564/tellerv2-poolsv2-base/api",
    arbitrum: "https://subgraph.satsuma-prod.com/daba7a4f162f/teller--16564/tellerv2-poolsv2-arbitrum/api",
    polygon: "https://subgraph.satsuma-prod.com/daba7a4f162f/teller--16564/tellerv2-poolsv2-polygon/api",
   // katana: "https://api.goldsky.com/api/public/project_cme01oezy1dwd01um5nile55y/subgraphs/teller-poolsv2-katana/0.4.21.8/gn"
 
  };



  // GraphQL query to get current pool metrics
  const query = gql`
    query  {
         groupPoolMetrics (first: 1000) {
          id
          group_pool_address
          principal_token_address
          collateral_token_address
          market_id
          total_principal_tokens_committed

         total_principal_tokens_withdrawn
           total_principal_tokens_borrowed
          token_difference_from_liquidations
            total_collateral_withdrawn
          total_interest_collected
          total_principal_tokens_repaid
          total_collateral_tokens_escrowed
          interest_rate_upper_bound
          interest_rate_lower_bound
          liquidity_threshold_percent
          collateral_ratio
        }
    }
  `;

  // Fetch token info (symbols and decimals)
  const fetchTokenInfo = async (tokenAddresses, chainString) => {
    const tokens = {};
    for (const address of tokenAddresses) {
      try {
         

         // Add timeout to prevent hanging
                const timeoutPromise = new Promise((_, reject) =>
                   setTimeout(() => reject(new Error('Token fetch timeout')), 1500 )
               );
       
               const tokenInfoPromise = sdk.api.erc20.info(address, chainString);
               const tokenInfo = await Promise.race([tokenInfoPromise, timeoutPromise]);



      //  const tokenInfo = await sdk.api.erc20.info(address, chainString);
        tokens[address.toLowerCase()] = {
          symbol: tokenInfo.output.symbol,
          decimals: Number(tokenInfo.output.decimals) || 18,
        };

         console.log(`Successfully fetched ${tokenInfo.output.symbol} for ${address}`);


      } catch (error) {
          console.warn(`failure to fetch token info ${address}, ${chainString}`);
        tokens[address.toLowerCase()] = { symbol: 'UNKNOWN', decimals: 18 };
      }
    }
    return tokens;
  };

  const topLvl = async (chainString, url, query, timestamp) => {
    // Fetch pool data from current state (Hasura endpoint doesn't support block queries)
  //  console.log(`Making GraphQL request to ${url} for ${chainString}`);
    let dataNow = await request(url, query);
   // console.log(`Raw response for ${chainString}:`, Object.keys(dataNow));
    dataNow = dataNow.groupPoolMetrics;
    console.log(`Found ${dataNow ? dataNow.length : 0} pools for ${chainString}`);

    if (!dataNow || dataNow.length === 0) {
      console.log(`No pools found for ${chainString}, returning empty array`);
      return [];
    }

    // Get unique token addresses from all pools
    const tokenAddresses = new Set();
    dataNow.forEach(pool => {
      tokenAddresses.add(pool.principal_token_address);
      tokenAddresses.add(pool.collateral_token_address);
    });

    // Fetch token info (symbols and decimals)
  //  console.log(`Fetching token info for ${tokenAddresses.size} unique tokens for ${chainString}`);
    const tokenInfo = await fetchTokenInfo(Array.from(tokenAddresses), chainString);
    console.log(`Token info fetched for ${chainString}, processing pools...`);

    // Enrich pool data with calculated metrics
    const enrichedData = await Promise.all(
      dataNow.map(async (pool, index) => {
        console.log(`Processing pool ${index + 1}/${dataNow.length} for ${chainString}: ${pool.group_pool_address}`);

        let pricesByAddress = {};
        try {
          const prices = await utils.getPrices(
            [pool.principal_token_address, pool.collateral_token_address],
            chainString
          );
          pricesByAddress = prices.pricesByAddress || {};
          console.log(`Got prices for pool ${index + 1}/${dataNow.length} for ${chainString}`);
        } catch (priceError) {
          console.warn(`Failed to get prices for pool ${pool.group_pool_address} on ${chainString}:`, priceError.message);
          pricesByAddress = {};
        }

        const principalTokenDecimals = tokenInfo[pool.principal_token_address.toLowerCase()]?.decimals || 18;
        const principalTokenDivisor = 10 ** principalTokenDecimals;

        const collateralTokenDecimals = tokenInfo[pool.collateral_token_address.toLowerCase()]?.decimals || 18;
        const collateralTokenDivisor = 10 ** collateralTokenDecimals;

        const totalInterestCollected = Number(pool.total_interest_collected);
        const tokenDifferenceFromLiquidatons = Number(pool.token_difference_from_liquidations);
        const totalCollateralEscrowedNet = Number(pool.total_collateral_tokens_escrowed) - Number(pool.total_collateral_withdrawn);

        const totalCollateralUsd =
          totalCollateralEscrowedNet *
          (parseFloat(pricesByAddress[pool.collateral_token_address.toLowerCase()] || 0) / collateralTokenDivisor);

        const totalTokensActivelyBorrowed =
          Number(pool.total_principal_tokens_borrowed) - Number(pool.total_principal_tokens_repaid);
        const totalTokensActivelyCommitted =
          Number(pool.total_principal_tokens_committed) +
          totalInterestCollected +
          tokenDifferenceFromLiquidatons -
          Number(pool.total_principal_tokens_withdrawn);

        const totalCommitted = Number(totalTokensActivelyCommitted);
        const totalBorrowed = Number(totalTokensActivelyBorrowed);

        const totalSupplyUsd =
          Math.max(0, totalCommitted *
          (parseFloat(pricesByAddress[pool.principal_token_address.toLowerCase()] || 0) / principalTokenDivisor));

        const totalBorrowUsd =
          Math.max(0, totalBorrowed *
          (parseFloat(pricesByAddress[pool.principal_token_address.toLowerCase()] || 0) / principalTokenDivisor));

        const tvlUsd = totalSupplyUsd - totalBorrowUsd;
        const poolBorrowedPercent = totalCommitted > 0 ? Math.min(Math.max(totalBorrowed / totalCommitted, 0), 1) : 0;

        const interestRateLowerBound = Number(pool.interest_rate_lower_bound) || 500;
        const interestRateUpperBound = Number(pool.interest_rate_upper_bound) || 1500;

        const apyBase = calculateActiveLenderYield(poolBorrowedPercent, interestRateLowerBound, interestRateUpperBound);
        const ltv = 100.0 / (Number(pool.collateral_ratio) / 100.0);
        const borrowApy = calculateActiveBorrowerYield(poolBorrowedPercent, interestRateLowerBound, interestRateUpperBound);

        const principalSymbol = tokenInfo[pool.principal_token_address.toLowerCase()]?.symbol || 'UNKNOWN';
        const collateralSymbol = tokenInfo[pool.collateral_token_address.toLowerCase()]?.symbol || 'UNKNOWN';

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
          collateralTokenDecimals,
          totalCollateralUsd,
        };
      })
    );

     console.log(`enriching data for  ${chainString} ...`);


    // For each enriched pool, create separate lending and collateral pool objects
    return enrichedData.flatMap((p) => {
      // Skip pools with unknown tokens or invalid data
      if (p.principalSymbol === 'UNKNOWN' || p.collateralSymbol === 'UNKNOWN') {
        console.log(`Skipping pool ${p.group_pool_address} due to unknown tokens`);
        return [];
      }

      // Skip pools with invalid LTV (too small or too large)
      if (p.ltv < 0.001 || p.ltv > 1) {
        console.log(`Skipping pool ${p.group_pool_address} due to invalid LTV: ${p.ltv}`);
        return [];
      }

      // Skip pools with very low TVL
      if (p.totalSupplyUsd < 1000 || p.totalCollateralUsd < 1000) {
        console.log(`Skipping pool ${p.group_pool_address} due to low TVL`);
        return [];
      }

      const underlyingTokens = [p.principal_token_address, p.collateral_token_address];
      const chain = chainString === 'ethereum' ? 'mainnet' : chainString;
      const url = `https://app.teller.org/${chainString}/lend/pool/${p.group_pool_address}`;

      const lendingPool = {
        pool: p.group_pool_address + "-lending",
        chain: utils.formatChain(chainString),
        project: 'teller',
        symbol: p.principalSymbol,
        poolMeta: p.collateralSymbol,
        tvlUsd: Number(p.totalSupplyUsd.toFixed(4)),
        apyBase: p.apyBase,
        underlyingTokens,
        url,
      };

      const collateralPool = {
        pool: p.group_pool_address + "-collateral",
        chain: utils.formatChain(chainString),
        project: 'teller',
        symbol: p.collateralSymbol,
        mintedCoin: p.principalSymbol,
        tvlUsd: Number(p.totalCollateralUsd.toFixed(4)),
        totalSupplyUsd: Number(p.totalCollateralUsd.toFixed(4)),
        totalBorrowUsd: Number(p.totalBorrowUsd.toFixed(4)),
        ltv: p.ltv,
        apyBaseBorrow: p.borrowApy,
        apyBase: 0,
        underlyingTokens,
        url,
      };

      return [lendingPool, collateralPool];
    });
  };

  // Calculate active yield for lenders
  const calculateActiveLenderYield = (poolBorrowedPercent, interestRateLowerBound, interestRateUpperBound) => {
    let poolYieldRaw;
    if (poolBorrowedPercent === 0) {
      poolYieldRaw = interestRateLowerBound;
    } else if (poolBorrowedPercent === 1) {
      poolYieldRaw = interestRateUpperBound;
    } else {
      const range = interestRateUpperBound - interestRateLowerBound;
      poolYieldRaw = interestRateLowerBound + (poolBorrowedPercent * range);
    }
    return (poolYieldRaw / 100) * poolBorrowedPercent;
  };

  // Calculate active yield for borrowers
  const calculateActiveBorrowerYield = (poolBorrowedPercent, interestRateLowerBound, interestRateUpperBound) => {
    let poolYieldRaw;
    if (poolBorrowedPercent === 0) {
      poolYieldRaw = interestRateLowerBound;
    } else if (poolBorrowedPercent === 1) {
      poolYieldRaw = interestRateUpperBound;
    } else {
      const range = interestRateUpperBound - interestRateLowerBound;
      poolYieldRaw = interestRateLowerBound + (poolBorrowedPercent * range);
    }
    return poolYieldRaw / 100;
  };

  const main = async (timestamp = null) => {
    let data = [];
   

     for (const [chain, url] of Object.entries(pools_v2_endpoints)) {
      if (!url) {
        console.log(`Skipping v2 data for ${chain} - no URL configured`);
        continue;
      }
      try {
        console.log(`Fetching v2 data for ${chain}...`);
        const chainData = await topLvl(chain, url, query, timestamp);
        data.push(...chainData);
      } catch (err) {
        console.log(chain, err);
      }
    } 

     for (const [chain, url] of Object.entries(pools_v1_endpoints)) {
      if (!url) {
        console.log(`Skipping v1 data for ${chain} - no URL configured`);
        continue;
      }
      try {
        console.log(`Fetching v1 data for ${chain}...`);
        const chainData = await topLvl(chain, url, query, timestamp);
        data.push(...chainData);
      } catch (err) {
        console.log(chain, err);
      }
    }

     console.log(`build filteredData ...`);

    const filteredData = data.filter((p) => utils.keepFinite(p));
    return filteredData;
  };

  module.exports = {
    timetravel: false,
    apy: main,
  };
