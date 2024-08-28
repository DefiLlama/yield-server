const { request } = require('graphql-request');
const { default: BigNumber } = require('bignumber.js');
const sdk = require('@defillama/sdk');
const { blacklistedPools } = require('./blacklist.js');
const { graphQuery } = require('./query.js');

const protocolSlug = 'impermax-finance';
const SECONDS_PER_YEAR = BigNumber(60 * 60 * 24 * 365);

/**
 *  IMPERMAX CHAIN CONFIGS
 */

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
      'https://api.studio.thegraph.com/query/46041/impermax-scroll-solv2-stable/v0.0.7',
    ],
  },
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

/**
 *  TOKEN PRICES
 */

// Try get from llama api, else get dexscreener
const getUnderlyingPrices = async (chain, tokenAddresses) => {
  const uniqueTokens = tokenAddresses.filter(
    (value, index, array) => array.indexOf(value) === index
  );

  const { result: tokenPrices, missingTokens } = await getPriceFromDefiLlama(
    chain,
    tokenAddresses
  );

  if (missingTokens.length > 0) {
    console.log(
      `Fetching ${missingTokens.length} tokens from Dexscreener on ${chain}`
    );
    const dexScreenerPrices = await Promise.all(
      missingTokens.map((token) => getPriceFromDexScreener(token))
    );

    missingTokens.forEach((token, index) => {
      const key = `${chain}:${token}`;
      if (dexScreenerPrices[index] !== undefined) {
        tokenPrices[key] = { price: dexScreenerPrices[index] };
      } else {
        console.warn(`Can't get price for token ${key}`);
      }
    });
  }

  return tokenPrices;
};

async function getPriceFromDefiLlama(chain, tokenAddresses) {
  const coins = tokenAddresses
    .map((address) => `${chain}:${address}`)
    .join(',');

  const response = await fetch(
    `https://coins.llama.fi/prices/current/${coins}`
  );

  const prices = await response.json();

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

  return { result, missingTokens };
}

async function getPriceFromDexScreener(token) {
  try {
    const { pairs } = await fetch(
      `https://api.dexscreener.com/latest/dex/tokens/${token}`
    ).then((i) => i.json());

    if (!pairs?.length) {
      console.warn(`No pairs found on DexScreener for token: ${token}`);
      return undefined;
    }

    // Get pair with max liquidity
    const pairsWithLiquidity = pairs.filter(
      (p) => p.liquidity && p.liquidity.usd > 0
    );
    const maxLiquidityPair = pairsWithLiquidity.reduce((prev, curr) => {
      return prev && prev.liquidity.usd > curr.liquidity.usd ? prev : curr;
    });

    return parseFloat(maxLiquidityPair.priceUsd);
  } catch (error) {
    console.error(`Dexscreener price fail for token: ${token}:`, error.message);
    return undefined;
  }
}

/**
 *  BORROWABLE YIELDS
 */

// Since we're a lending protocol the TVL is the excess supply (ie. `totalBalance`)
const calculateTvl = (totalBalance, tokenPriceUsd) =>
  BigNumber(totalBalance).times(BigNumber(tokenPriceUsd));

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

const calculateTotalBorrows = (totalBorrows, tokenPriceUsd) =>
  BigNumber(totalBorrows).times(BigNumber(tokenPriceUsd));

// Loop through each chain in the config
//   -> Loop through each project in the chain
//     -> Loop through each lending pool in the project and push borrowables yields
const main = async () => {
  const pools = [];

  for (const [chain, projects] of Object.entries(config)) {
    for (const [project, _] of Object.entries(projects)) {
      const lendingPools = await getLendingPools(chain, project);

      const tokenAddresses = lendingPools.flatMap((pool) => [
        pool.borrowable0.underlying.id,
        pool.borrowable1.underlying.id,
      ]);

      const prices = await getUnderlyingPrices(chain, tokenAddresses);

      for (const pool of lendingPools) {
        const token0 = pool.borrowable0.underlying;
        const token1 = pool.borrowable1.underlying;

        const price0 = prices[`${chain}:${token0.id}`]?.price;
        const price1 = prices[`${chain}:${token1.id}`]?.price;

        // If no prices we skip this lending pool
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
