const sdk = require('@defillama/sdk');
const BigNumber = require('bignumber.js');
const utils = require('../utils');

const PROJECT_NAME = 'goldfinger';
const CHAIN = 'bsc';

const ART_TOKEN = '0xb8a1eD561C914F22BD69b0bb4558ad5A89FeAAE1';

const ABI = {
  totalSupply: 'function totalSupply() view returns (uint256)',
  decimals: 'function decimals() view returns (uint8)',
};

const SECONDS_PER_DAY = 86400;
const LOOKBACK_DAYS = 30;

/**
 * Fetches historical price from DefiLlama coins API
 */
async function getHistoricalPrice(address, chain, daysAgo) {
  const timestamp = Math.floor(Date.now() / 1000) - daysAgo * SECONDS_PER_DAY;
  const key = `${chain}:${address}`;

  try {
    const data = await utils.getData(
      `https://coins.llama.fi/prices/historical/${timestamp}/${key}`
    );
    return {
      price: data.coins[key]?.price || 0,
      timestamp: data.coins[key]?.timestamp || timestamp,
    };
  } catch (error) {
    console.error(`GoldFinger: Failed to fetch historical price`, error);
    return { price: 0, timestamp };
  }
}

/**
 * Fetches current price from DefiLlama coins API
 */
async function getCurrentPrice(address, chain) {
  const key = `${chain}:${address}`;

  try {
    const data = await utils.getData(
      `https://coins.llama.fi/prices/current/${key}`
    );
    return {
      price: data.coins[key]?.price || 0,
      timestamp: Math.floor(Date.now() / 1000),
      decimals: data.coins[key]?.decimals || 18,
    };
  } catch (error) {
    console.error(`GoldFinger: Failed to fetch current price`, error);
    return { price: 0, timestamp: Math.floor(Date.now() / 1000), decimals: 18 };
  }
}

/**
 * Calculate APY based on price appreciation over time
 * Uses compound growth formula: APY = (currentPrice / historicalPrice)^(365/days) - 1
 */
function computeAPY(currentPrice, historicalPrice, days) {
  if (historicalPrice <= 0 || currentPrice <= 0 || days <= 0) {
    return 0;
  }

  const growth = currentPrice / historicalPrice;

  // If price decreased, no yield
  if (growth < 1) {
    return 0;
  }

  const annualizationFactor = 365 / days;
  const apy = (Math.pow(growth, annualizationFactor) - 1) * 100;

  return Number(apy.toFixed(2));
}

const main = async () => {
  // Fetch current price
  const currentPriceData = await getCurrentPrice(ART_TOKEN, CHAIN);

  // Fetch historical price from 30 days ago
  const historicalPriceData = await getHistoricalPrice(
    ART_TOKEN,
    CHAIN,
    LOOKBACK_DAYS
  );

  // Get total supply and decimals for TVL calculation
  const [totalSupplyResult, decimalsResult] = await Promise.all([
    sdk.api.abi.call({
      target: ART_TOKEN,
      abi: ABI.totalSupply,
      chain: CHAIN,
    }),
    sdk.api.abi.call({
      target: ART_TOKEN,
      abi: ABI.decimals,
      chain: CHAIN,
    }),
  ]);

  const totalSupply = new BigNumber(totalSupplyResult.output);
  const tokenDecimals = Number(decimalsResult.output);
  const price = new BigNumber(currentPriceData.price);

  // Calculate TVL using BigNumber arithmetic to avoid overflow
  const tvlUsd = totalSupply
    .dividedBy(new BigNumber(10).pow(tokenDecimals))
    .multipliedBy(price)
    .toNumber();

  // Calculate APY from price appreciation
  const apy = computeAPY(
    currentPriceData.price,
    historicalPriceData.price,
    LOOKBACK_DAYS
  );

  const pool = {
    pool: `${ART_TOKEN.toLowerCase()}-${CHAIN}`,
    chain: utils.formatChain(CHAIN),
    project: PROJECT_NAME,
    symbol: 'ART',
    tvlUsd,
    apyBase: apy,
    underlyingTokens: [ART_TOKEN],
    poolMeta: 'Gold-backed yield-bearing token',
  };

  return [pool].filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://goldfinger.finance/en',
};
