const { request } = require('graphql-request');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');

const protocolSlug = 'impermax-finance';
const SECONDS_PER_YEAR = BigNumber(60 * 60 * 24 * 365);

const config = {
  fantom: {
    Equalizer: [
      'https://api.studio.thegraph.com/query/46041/impermax-fantom-solv2/v0.0.2',
    ],
  },
  optimism: {
    Velodrome: [
      'https://api.studio.thegraph.com/query/46041/impermax-optimism-solv2/v0.0.1',
    ],
  },
  scroll: {
    Tokan: [
      'https://api.studio.thegraph.com/query/46041/impermax-scroll-solv2/v0.0.1',
      'https://api.studio.thegraph.com/query/46041/impermax-scroll-solv2-stable/v0.0.7', // Stable
    ],
  },
};

const blacklistedPools = {
  fantom: ['0x65151e7a82c4415a73756608e2c66b39a57dca12'.toLowerCase()],
  scroll: [
    /* deployed with the univ2 not staked so ignore these */
    '0x838D141BdBECeAA2EB1C576b6a4309f26f795CF2'.toLowerCase(), // tkn/chi
    '0xFFCe6dB18f18D711EF7Bf45b501A6b652b44bC43'.toLowerCase(), // zen/chi
    '0xD448ac2A2d9C85010459E5f5Bf81931E5Bc40EC3'.toLowerCase(), // chi/weth
    '0x7f0997bC0ee78553DDAb736d945b7Ba10Fe38B2E'.toLowerCase(), // wbtc/weth
  ],
};

const graphQuery = `{
  lendingPools {
    id
    borrowable0 {
      id
      totalBalance
      totalBorrows
      reserveFactor
      borrowRate
      underlying {
        id
        name
        symbol
        decimals
      }
    }
    borrowable1 {
      id
      totalBalance
      totalBorrows
      reserveFactor
      borrowRate
      underlying {
        id
        name
        symbol
        decimals
      }
    }
    collateral {
      id
      safetyMargin
      liquidationIncentive
      liquidationFee
      totalBalance
    }
  }
}`;

// NOTE: This should *almost* never fail (outside of rate limiting).
//       If fails then blacklist the lending pool because it is badly configured.
async function getPriceFromDexScreener(token) {
  console.log('Getting prices from dexscreener...');
  console.log('Token: %s', token);
  try {
    const { pairs } = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${token}`
    ).then((i) => i.json());

    if (!pairs?.length) {
      console.warn(`No pairs found on DexScreener for token: ${token}`);
      return undefined;
    }

    // Remove pairs with no liquidity
    const pairsWithLiquidity = pairs.filter(
      (p) => p.liquidity && p.liquidity.usd > 0
    );

    // Get pair with max liquidity
    const maxLiquidityPair = pairsWithLiquidity.reduce((prev, curr) => {
      return prev && prev.liquidity.usd > curr.liquidity.usd ? prev : curr;
    });

    return parseFloat(maxLiquidityPair.priceUsd);
  } catch (error) {
    console.error(`Dexscreener price fail for token: ${token}:`, error.message);
    return undefined;
  }
}

// Gets all token prices from the chain
// 1. `tokenAddresses` is a list of all underlying tokens on this chain
// 2. Tries to get prices from defillama coins api
// 3. The response returns only prices of tokens it has
// 4. Check which tokens we are missing
// 5. Fetch the missing token prices from dexscreener
const getUnderlyingPrices = async (chain, tokenAddresses) => {
  // Remove duplicate underlyings
  const uniqueTokens = tokenAddresses.filter(
    (value, index, array) => array.indexOf(value) === index
  );

  const coins = uniqueTokens.map((address) => `${chain}:${address}`).join(',');
  const prices = await fetch(
    `https://coins.llama.fi/prices/current/${coins}`
  ).then((i) => i.json());

  const result = {};
  const missingTokens = [];

  for (const address of tokenAddresses) {
    const key = `${chain}:${address}`;
    if (prices.coins[key] && prices.coins[key].price) {
      result[key] = { price: prices.coins[key].price };
    } else {
      missingTokens.push(address);
    }
  }

  // If missing tokens from defillama API, we try dexscreener
  if (missingTokens.length > 0) {
    console.log(`Fetching ${missingTokens.length} tokens from Dexscreener`);

    const dexScreenerPrices = await Promise.all(
      missingTokens.map((token) => getPriceFromDexScreener(token))
    );

    missingTokens.forEach((token, index) => {
      const key = `${chain}:${token}`;
      if (dexScreenerPrices[index] !== undefined) {
        result[key] = { price: dexScreenerPrices[index] };
      } else {
        // Should never be here
        console.warn(`Can't get price for token ${key}`);
      }
    });
  }

  return result;
};

const getLendingPools = async (chain, project) => {
  const urls = config[chain][project];
  let allLendingPools = [];

  for (const url of urls) {
    const queryResult = await request(url, graphQuery);
    allLendingPools = allLendingPools.concat(queryResult.lendingPools);
  }

  const blacklist = blacklistedPools[chain] || [];
  return allLendingPools.filter((pool) => !blacklist.includes(pool.id));
};

// Annualized Borrow APR
const calculateBorrowApr = (borrowRate) =>
  BigNumber(borrowRate).times(SECONDS_PER_YEAR).times(BigNumber(100));

// Annualized Supply APR
const calculateSupplyApr = (
  totalBorrows,
  totalBalance,
  borrowRate,
  reserveFactor
) => {
  const utilization = BigNumber(totalBorrows).div(
    BigNumber(totalBorrows).plus(BigNumber(totalBalance))
  );
  return BigNumber(borrowRate)
    .times(utilization)
    .times(BigNumber(1).minus(BigNumber(reserveFactor)));
};

// totlaBalance == excess supply (ie. available to be borrowed now)
// tvlUsd = totalBalance * tokenPrice
const calculateTvl = (totalBalance, tokenPriceUsd) =>
  BigNumber(totalBalance).times(BigNumber(tokenPriceUsd));

// borrowsUsd = totalBorrows * tokenPrice
const calculateTotalBorrows = (totalBorrows, tokenPriceUsd) =>
  BigNumber(totalBorrows).times(BigNumber(tokenPriceUsd));

const main = async () => {
  const pools = [];

  for (const [chain, projects] of Object.entries(config)) {
    console.log("Getting yields from: %s", chain)
    for (const [project, _] of Object.entries(projects)) {
      const lendingPools = await getLendingPools(chain, project);

      const tokenAddresses = lendingPools.flatMap((pool) => [
        pool.borrowable0.underlying.id,
        pool.borrowable1.underlying.id,
      ]);

      const prices = await getUnderlyingPrices(chain, tokenAddresses);

      // We look
      for (const pool of lendingPools) {
        const token0 = pool.borrowable0.underlying;
        const token1 = pool.borrowable1.underlying;

        const price0 = prices[`${chain}:${token0.id}`]?.price;
        const price1 = prices[`${chain}:${token1.id}`]?.price;

        // If no prices we skip borrowable0/borrowable1
        if (!price0 || !price1) {
          console.warn(`Missing price, skipping lending pool ${pool.id}`);
          continue;
        }

        const tvlUsd0 = calculateTvl(pool.borrowable0.totalBalance, price0);
        const tvlUsd1 = calculateTvl(pool.borrowable1.totalBalance, price1);

        const totalBorrowsUsd0 = calculateTotalBorrows(
          pool.borrowable0.totalBorrows,
          price0
        );
        const totalBorrowsUsd1 = calculateTotalBorrows(
          pool.borrowable1.totalBorrows,
          price1
        );

        const borrowApr0 = calculateBorrowApr(pool.borrowable0.borrowRate);
        const borrowApr1 = calculateBorrowApr(pool.borrowable1.borrowRate);

        const supplyApr0 = calculateSupplyApr(
          pool.borrowable0.totalBorrows,
          pool.borrowable0.totalBalance,
          borrowApr0,
          pool.borrowable0.reserveFactor
        );
        const supplyApr1 = calculateSupplyApr(
          pool.borrowable1.totalBorrows,
          pool.borrowable1.totalBalance,
          borrowApr1,
          pool.borrowable1.reserveFactor
        );

        // Push borrowable0
        pools.push({
          pool: `${pool.id}-${token0.symbol}-${chain}`,
          poolMeta: `${project} ${token0.symbol}/${token1.symbol}`,
          chain,
          project: protocolSlug,
          symbol: token0.symbol,
          tvlUsd: tvlUsd0.toNumber(),
          totalBorrowUsd: totalBorrowsUsd0.toNumber(),
          apyBase: supplyApr0.toNumber(),
          apyBaseBorrow: borrowApr0.toNumber(),
          underlyingTokens: [token0.id, token1.id],
        });

        // Push borrowable1
        pools.push({
          pool: `${pool.id}-${token1.symbol}-${chain}`,
          poolMeta: `${project} ${token0.symbol}/${token1.symbol}`,
          chain,
          project: protocolSlug,
          symbol: token1.symbol,
          tvlUsd: tvlUsd1.toNumber(),
          totalBorrowUsd: totalBorrowsUsd1.toNumber(),
          apyBase: supplyApr1.toNumber(),
          apyBaseBorrow: borrowApr1.toNumber(),
          underlyingTokens: [token0.id, token1.id],
        });
      }
    }
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.impermax.finance/',
};
