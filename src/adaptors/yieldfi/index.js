const utils = require('../utils');
const { ethers } = require("ethers");
const sdk = require('@defillama/sdk');

// Constants
const CHAIN = 'ethereum';
const DECIMALS = {
  yUSD: 18,
  vyUSD: 18
};

// Contract addresses
const CONTRACTS = {
  yUSD: "0x19Ebd191f7A24ECE672ba13A302212b5eF7F35cb",
  vyUSD: "0x2e3C5e514EEf46727DE1FE44618027A9b70D92FC"
};

// API endpoints
const API_ENDPOINTS = {
  yUSD: 'https://ctrl.yield.fi/t/yusd/apyHistory',
  vyUSD: 'https://ctrl.yield.fi/t/vyusd/apyHistory'
};

// ABIs
const ABIS = {
  totalSupply: 'function totalSupply() view returns (uint256)'
};

/**
 * Fetch latest APY data from the API
 * @param {string} tokenSymbol - Token symbol (yUSD or vyUSD)
 * @returns {Promise<number>} Latest APY
 */
const fetchLatestAPY = async (tokenSymbol) => {
  try {
    const endpoint = API_ENDPOINTS[tokenSymbol];
    if (!endpoint) {
      console.error(`No API endpoint found for ${tokenSymbol}`);
      return 0;
    }

    const response = await fetch(endpoint);
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }

    const data = await response.json();
    const apyHistory = data.apy_history;

    if (!apyHistory || !Array.isArray(apyHistory) || apyHistory.length === 0) {
      console.error(`No APY history data found for ${tokenSymbol}`);
      return 0;
    }

    // Get the latest APY (first entry in the array is the most recent)
    const latestAPY = apyHistory[0].apy;

    console.log(`${tokenSymbol} latest APY: ${latestAPY.toFixed(2)}%`);
    return parseFloat(latestAPY.toFixed(2));
  } catch (error) {
    console.error(`Error fetching APY for ${tokenSymbol}:`, error);
    return 0;
  }
};

/**
 * Get TVL for a specific token
 * @param {string} tokenAddress - Token contract address
 * @returns {Promise<number>} TVL value
 */
const getTVL = async (tokenAddress) => {
  try {
    const response = await sdk.api.abi.call({
      chain: CHAIN,
      abi: ABIS.totalSupply,
      target: tokenAddress
    });
    return parseFloat((response.output / 10 ** DECIMALS.yUSD).toFixed(2));
  } catch (error) {
    console.error(`Error getting TVL for ${tokenAddress}:`, error);
    return 0;
  }
};

/**
 * Create pool object for a token
 * @param {string} tokenAddress - Token contract address
 * @param {string} symbol - Token symbol
 * @param {number} tvl - Total Value Locked
 * @param {number} apy - Annual Percentage Yield
 * @returns {Object} Pool object
 */
const createPool = (tokenAddress, symbol, tvl, apy) => ({
  pool: tokenAddress,
  chain: CHAIN,
  project: 'yieldfi',
  symbol: utils.formatSymbol(symbol),
  tvlUsd: tvl,
  apyBase: apy,
});

/**
 * Process token data
 * @param {string} tokenAddress - Token contract address
 * @param {string} symbol - Token symbol
 * @returns {Promise<Object|null>} Pool object or null if error
 */
const processToken = async (tokenAddress, symbol) => {
  try {
    const [tvl, apy] = await Promise.all([
      getTVL(tokenAddress),
      fetchLatestAPY(symbol)
    ]);

    if (apy === 0) {
      console.log(`No APY data available for ${symbol}`);
      return null;
    }

    return createPool(tokenAddress, symbol, tvl, apy);
  } catch (error) {
    console.error(`Error processing ${symbol}:`, error);
    return null;
  }
};

/**
 * Main function to get pool data
 * @returns {Promise<Array>} Array of pool objects
 */
const poolsFunction = async () => {
  try {
    // Process both tokens
    const [yusdPool, vyusdPool] = await Promise.all([
      processToken(CONTRACTS.yUSD, 'yUSD'),
      processToken(CONTRACTS.vyUSD, 'vyUSD')
    ]);

    return [yusdPool, vyusdPool].filter(Boolean);
  } catch (error) {
    console.error('Error in poolsFunction:', error);
    return [];
  }
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://yield.fi/mint',
};
