const sdk = require('@defillama/sdk');
const { request, gql } = require('graphql-request');
const axios = require('axios');
const utils = require('../utils');

// Supported chains and their subgraph endpoints (Ormi Labs)
const pools_v1_endpoints = {
  ethereum: "https://api.subgraph.migration.ormilabs.com/subgraphs/id/QmSSDg8XePRJu5zibC955LHNV9Au5GPq7qPcUTrmsQu8Wt",
  base: "https://api.subgraph.migration.ormilabs.com/subgraphs/id/QmekaTZkP9r4mHHawko2z4YLHo7XTfNZ7FrbotViDe6pYt",
  arbitrum: "https://api.subgraph.migration.ormilabs.com/subgraphs/id/Qme9KeTZdLrVyHh3QRucvjgfnHKkmndjqGEW6hMFKxWv3o",
  polygon: "https://api.subgraph.migration.ormilabs.com/subgraphs/id/QmSeGXy47e9jPAjuaxQ5WwQthzCmMfthh3NKNzLTNm7Cmw",
};
const pools_v2_endpoints = {
  ethereum: "https://api.subgraph.migration.ormilabs.com/subgraphs/id/QmW6TetrwFmjiCrTCW15SskJThJvRTvpJVrRNtGMBX51Ag",
  base: "https://api.subgraph.migration.ormilabs.com/subgraphs/id/Qmb86xPeygvQFMmNN9j8aiCXqqFrcsKHu6nTrqfQwPeoqb",
  arbitrum: "https://api.subgraph.migration.ormilabs.com/subgraphs/id/QmSexfnJV8EZTuVmoXaXJTKpJ7Q6ymPmPV7ShppTWZFe12",
  polygon: "https://api.subgraph.migration.ormilabs.com/subgraphs/id/QmSdT2h3HGXjZ6j2YtTWRJFVm8EJYumzcnfRAgCoFxczmR",
};

// Non-pool (direct P2P) loan subgraphs via The Graph Protocol
const GRAPH_API_KEY = 'c2d64965ccdfcfed572cdb30b0369ab0';
const nonpool_endpoints = {
  ethereum: `https://gateway.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/4JruhWH1ZdwvUuMg2xCmtnZQYYHvmEq6cmTcZkpM6pW`,
  base: `https://gateway.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/8jSq7mzq9HEiJEcAZfvrTT4wYk59oMxm82xUpcVBzryF`,
  arbitrum: `https://gateway.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/F2Cgx4q4ATiopuZ13nr1EMKmZXwfAdevF3EujqfayK7a`,
  polygon: `https://gateway.thegraph.com/api/${GRAPH_API_KEY}/subgraphs/id/BBp2ZJTG8j4sx9gLoFYN6iLCpWQsNpoiYjXNwRcE3DQr`,
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
        total_collateral_tokens_withdrawn
        total_interest_collected
        total_principal_tokens_repaid
        total_principal_tokens_repaid_by_liquidation_auction
        total_collateral_tokens_deposited
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
      const totalCollateralEscrowedNet = Number(pool.total_collateral_tokens_deposited) - Number(pool.total_collateral_tokens_withdrawn);

      const totalCollateralUsd =
        totalCollateralEscrowedNet *
        (parseFloat(pricesByAddress[pool.collateral_token_address.toLowerCase()] || 0) / collateralTokenDivisor);

      // Include defaulted/liquidated loans in borrow totals:
      // total_principal_tokens_repaid includes liquidation auction amounts,
      // so we add back total_principal_tokens_repaid_by_liquidation_auction
      // to count defaulted loans as still borrowed.
      const totalTokensActivelyBorrowed =
        Number(pool.total_principal_tokens_borrowed) -
        Number(pool.total_principal_tokens_repaid) +
        Number(pool.total_principal_tokens_repaid_by_liquidation_auction);
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

      const tvlUsd = Math.max(0, totalSupplyUsd - totalBorrowUsd);
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

// GraphQL query to fetch active non-pool bids (no commitment = direct P2P loan)
const nonPoolQueryString = `
  query ($lastId: String!) {
    bids(
      first: 1000,
      where: { status: "Accepted", commitment: null, id_gt: $lastId }
      orderBy: id
      orderDirection: asc
    ) {
      id
      principal
      lendingTokenAddress
      apr
      totalRepaidPrincipal
      lendingToken { symbol decimals }
      collateral { collateralAddress amount type }
    }
  }
`;

const fetchNonPoolBids = async (chainString, endpoint) => {
  let allBids = [];
  let lastId = '';
  // Paginate through all active non-pool bids
  while (true) {
    const response = await axios.post(endpoint, {
      query: nonPoolQueryString,
      variables: { lastId },
    });
    const bids = response.data?.data?.bids || [];
    if (bids.length === 0) break;
    allBids = allBids.concat(bids);
    lastId = bids[bids.length - 1].id;
    if (bids.length < 1000) break;
  }
  console.log(`Found ${allBids.length} active non-pool bids for ${chainString}`);
  return allBids;
};

const topLvlNonPool = async (chainString, endpoint) => {
  const bids = await fetchNonPoolBids(chainString, endpoint);
  if (bids.length === 0) return [];

  // Group bids by lending token
  const byToken = {};
  for (const bid of bids) {
    const addr = bid.lendingTokenAddress.toLowerCase();
    if (!byToken[addr]) {
      byToken[addr] = {
        lendingTokenAddress: addr,
        symbol: bid.lendingToken?.symbol || 'UNKNOWN',
        decimals: Number(bid.lendingToken?.decimals || 18),
        totalOutstanding: 0,
        aprWeightedSum: 0,
        bidCount: 0,
        collateralByToken: {},
      };
    }
    const outstanding = Number(bid.principal) - Number(bid.totalRepaidPrincipal);
    if (outstanding <= 0) continue;
    const apr = Number(bid.apr);
    byToken[addr].totalOutstanding += outstanding;
    byToken[addr].aprWeightedSum += apr * outstanding;
    byToken[addr].bidCount += 1;

    // Track collateral deposits
    for (const c of (bid.collateral || [])) {
      const cAddr = c.collateralAddress.toLowerCase();
      if (!byToken[addr].collateralByToken[cAddr]) {
        byToken[addr].collateralByToken[cAddr] = 0;
      }
      byToken[addr].collateralByToken[cAddr] += Number(c.amount);
    }
  }

  const results = [];
  for (const [addr, info] of Object.entries(byToken)) {
    if (info.symbol === 'UNKNOWN' || info.totalOutstanding <= 0) continue;

    const divisor = 10 ** info.decimals;
    const outstandingTokens = info.totalOutstanding / divisor;

    // Get price for lending token
    let pricesByAddress = {};
    try {
      const prices = await utils.getPrices([addr], chainString);
      pricesByAddress = prices.pricesByAddress || {};
    } catch (e) {
      console.warn(`Failed to get price for non-pool token ${addr} on ${chainString}`);
      continue;
    }

    const tokenPrice = parseFloat(pricesByAddress[addr] || 0);
    if (tokenPrice === 0) continue;

    const totalBorrowUsd = outstandingTokens * tokenPrice;
    if (totalBorrowUsd < 100) continue;

    // Weighted average APR across active bids (apr is in basis points * 100, i.e. 1000 = 10%)
    const avgApr = info.totalOutstanding > 0
      ? info.aprWeightedSum / info.totalOutstanding
      : 0;
    const borrowApy = avgApr / 100;
    // For non-pool loans, lender yield equals the borrower rate (fully utilized, no idle capital)
    const lenderApy = borrowApy;

    // Get collateral value
    let totalCollateralUsd = 0;
    const collateralAddresses = Object.keys(info.collateralByToken);
    if (collateralAddresses.length > 0) {
      try {
        const collPrices = await utils.getPrices(collateralAddresses, chainString);
        const collPricesByAddr = collPrices.pricesByAddress || {};
        const collTokenInfo = await fetchTokenInfo(collateralAddresses, chainString);
        for (const [cAddr, cAmount] of Object.entries(info.collateralByToken)) {
          const cDecimals = collTokenInfo[cAddr]?.decimals || 18;
          const cPrice = parseFloat(collPricesByAddr[cAddr] || 0);
          totalCollateralUsd += (cAmount / (10 ** cDecimals)) * cPrice;
        }
      } catch (e) {
        console.warn(`Failed to get collateral prices for non-pool ${info.symbol} on ${chainString}`);
      }
    }

    const poolId = `teller-nonpool-${chainString}-${addr}`;
    const appUrl = `https://app.teller.org/${chainString}/lend`;

    // Lending entry: for non-pool loans all capital is borrowed (tvl = borrow amount)
    results.push({
      pool: poolId + '-lending',
      chain: utils.formatChain(chainString),
      project: 'teller',
      symbol: info.symbol,
      poolMeta: 'Non-Pool Loans',
      tvlUsd: Number(totalBorrowUsd.toFixed(4)),
      apyBase: lenderApy,
      totalSupplyUsd: Number(totalBorrowUsd.toFixed(4)),
      totalBorrowUsd: Number(totalBorrowUsd.toFixed(4)),
      underlyingTokens: [addr],
      url: appUrl,
    });

    // Collateral entry (only if we have meaningful collateral value)
    if (totalCollateralUsd >= 100) {
      results.push({
        pool: poolId + '-collateral',
        chain: utils.formatChain(chainString),
        project: 'teller',
        symbol: info.symbol,
        poolMeta: 'Non-Pool Collateral',
        tvlUsd: Number(totalCollateralUsd.toFixed(4)),
        totalSupplyUsd: Number(totalCollateralUsd.toFixed(4)),
        totalBorrowUsd: Number(totalBorrowUsd.toFixed(4)),
        apyBaseBorrow: borrowApy,
        apyBase: 0,
        underlyingTokens: [addr],
        url: appUrl,
      });
    }
  }

  console.log(`Generated ${results.length} non-pool entries for ${chainString}`);
  return results;
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

  // Fetch non-pool (direct P2P) loans from The Graph Protocol
  for (const [chain, endpoint] of Object.entries(nonpool_endpoints)) {
    if (!endpoint) {
      console.log(`Skipping non-pool data for ${chain} - no URL configured`);
      continue;
    }
    try {
      console.log(`Fetching non-pool data for ${chain}...`);
      const chainData = await topLvlNonPool(chain, endpoint);
      data.push(...chainData);
    } catch (err) {
      console.log(`Non-pool ${chain}:`, err.message || err);
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
