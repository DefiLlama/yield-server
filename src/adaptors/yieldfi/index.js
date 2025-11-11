const utils = require('../utils');
const { ethers } = require("ethers");
const sdk = require('@defillama/sdk');

// Constants
const DECIMALS = {
  yUSD: 18,
  vyUSD: 18,
  yETH: 18,
  vyETH: 18,
  yBTC: 18,
  vyBTC: 18,
};

// Contract addresses - Multi-chain configuration
const YUSD_CONTRACTS = {
  ethereum: "0x19Ebd191f7A24ECE672ba13A302212b5eF7F35cb",
  optimism: '0x4772D2e014F9fC3a820C444e3313968e9a5C8121',
  arbitrum: '0x4772D2e014F9fC3a820C444e3313968e9a5C8121',
  base: '0x4772D2e014F9fC3a820C444e3313968e9a5C8121',
  sonic: '0x4772D2e014F9fC3a820C444e3313968e9a5C8121',
  plume_mainnet: '0x4772D2e014F9fC3a820C444e3313968e9a5C8121',
  katana: "0x4772D2e014F9fC3a820C444e3313968e9a5C8121",
  bsc: "0x4772D2e014F9fC3a820C444e3313968e9a5C8121",
  avax: "0x4772D2e014F9fC3a820C444e3313968e9a5C8121",
  tac: "0x4772D2e014F9fC3a820C444e3313968e9a5C8121",
  linea: "0x4e559dBCCbe87De66c6a9F3f25231096F24c2e28",
  plasma: "0x4772D2e014F9fC3a820C444e3313968e9a5C8121",
  saga: "0x839e7e610108Cf3DCc9b40329db33b6E6bc9baCE",
};

const VYUSD_CONTRACTS = {
  ethereum: "0x2e3C5e514EEf46727DE1FE44618027A9b70D92FC",
  optimism: '0xF4F447E6AFa04c9D11Ef0e2fC0d7f19C24Ee55de',
  arbitrum: '0xF4F447E6AFa04c9D11Ef0e2fC0d7f19C24Ee55de',
  base: '0xF4F447E6AFa04c9D11Ef0e2fC0d7f19C24Ee55de',
  sonic: '0xF4F447E6AFa04c9D11Ef0e2fC0d7f19C24Ee55de',
  plume_mainnet: '0xF4F447E6AFa04c9D11Ef0e2fC0d7f19C24Ee55de',
  katana: "0xF4F447E6AFa04c9D11Ef0e2fC0d7f19C24Ee55de",
  bsc: "0xF4F447E6AFa04c9D11Ef0e2fC0d7f19C24Ee55de",
  avax: "0xF4F447E6AFa04c9D11Ef0e2fC0d7f19C24Ee55de",
  tac: "0xF4F447E6AFa04c9D11Ef0e2fC0d7f19C24Ee55de",
  linea: "0x168BC4DB5dcbecA279983324d3082c47e47569E7",
  plasma: "0xF4F447E6AFa04c9D11Ef0e2fC0d7f19C24Ee55de",
  saga: "0x704a58f888f18506C9Fc199e53AE220B5fdCaEd8",
};

const YETH_CONTRACTS = {
  ethereum: "0x8464F6eCAe1EA58EC816C13f964030eAb8Ec123A",
  arbitrum: "0x1F52Edf2815BfA625890B61d6bf43dDC24671Fe8",
  base: "0x1F52Edf2815BfA625890B61d6bf43dDC24671Fe8",
  saga: "0xA6F89de43315B444114258f6E6700765D08bcd56",
};

const VYETH_CONTRACTS = {
  ethereum: "0x3073112c2c4800b89764973d5790ccc7fba5c9f9",
  arbitrum: "0x8c93a6752Bfe29FDA26EbA8df4390c642e6A7f90",
  base: "0x8c93a6752Bfe29FDA26EbA8df4390c642e6A7f90"
};

const YBTC_CONTRACTS = {
  ethereum: "0xa01200b2e74DE6489cF56864E3d76BBc06fc6C43",
};

const VYBTC_CONTRACTS = {
  ethereum: "0x1e2a5622178f93EFd4349E2eB3DbDF2761749e1B",
};
// Supported chains
const SUPPORTED_CHAINS = Object.keys(YUSD_CONTRACTS);

// API endpoints
const API_ENDPOINTS = {
  yUSD: 'https://ctrl.yield.fi/t/apy/yusd/apyHistory',
  vyUSD: 'https://ctrl.yield.fi/t/apy/vyusd/apyHistory',
  yETH: 'https://ctrl.yield.fi/t/apy/yeth/apyHistory',
  vyETH: 'https://ctrl.yield.fi/t/apy/vyeth/apyHistory',
  yBTC: 'https://ctrl.yield.fi/t/apy/ybtc/apyHistory',
  vyBTC: 'https://ctrl.yield.fi/t/apy/vybtc/apyHistory',
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
 * Get TVL for a specific token on a specific chain
 * @param {string} tokenAddress - Token contract address
 * @param {string} chain - Blockchain name
 * @param {number} decimals - Token decimals
 * @returns {Promise<number>} TVL value in USD
 */
const getTVL = async (tokenAddress, chain, decimals = DECIMALS.yUSD) => {
  try {
    // Get total supply and token price in parallel
    const [supplyResponse, priceData] = await Promise.all([
      sdk.api.abi.call({
        chain: chain,
        abi: ABIS.totalSupply,
        target: tokenAddress
      }),
      utils.getPrices([tokenAddress], chain)
    ]);

    const totalSupply = supplyResponse.output / (10 ** decimals);
    const tokenPrice = priceData.pricesByAddress[tokenAddress.toLowerCase()] || 0;
    const tvlUsd = totalSupply * tokenPrice;  
    return parseFloat(tvlUsd.toFixed(2));
  } catch (error) {
    console.error(`Error getting TVL for ${tokenAddress} on ${chain}:`, error);
    return 0;
  }
};

/**
 * Create pool object for a token
 * @param {string} tokenAddress - Token contract address
 * @param {string} symbol - Token symbol
 * @param {string} chain - Blockchain name
 * @param {number} tvl - Total Value Locked
 * @param {number} apy - Annual Percentage Yield
 * @returns {Object} Pool object
 */
const createPool = (tokenAddress, symbol, chain, tvl, apy) => ({
  pool: `${tokenAddress}-${chain}`,
  chain: chain,
  project: 'yieldfi',
  symbol: utils.formatSymbol(symbol),
  tvlUsd: tvl,
  apyBase: apy,
});

/**
 * Process token data for a specific chain
 * @param {string} tokenAddress - Token contract address
 * @param {string} symbol - Token symbol
 * @param {string} chain - Blockchain name
 * @returns {Promise<Object|null>} Pool object or null if error
 */
const processToken = async (tokenAddress, symbol, chain) => {
  try {
    const [tvl, apy] = await Promise.all([
      getTVL(tokenAddress, chain),
      fetchLatestAPY(symbol)
    ]);

    if (apy === 0) {
      console.log(`No APY data available for ${symbol} on ${chain}`);
      return null;
    }

    return createPool(tokenAddress, symbol, chain, tvl, apy);
  } catch (error) {
    console.error(`Error processing ${symbol} on ${chain}:`, error);
    return null;
  }
};

/**
 * Main function to get pool data for all chains
 * @returns {Promise<Array>} Array of pool objects
 */
const poolsFunction = async () => {
  const allPools = [];

  // Process all chains in parallel
  const chainPromises = SUPPORTED_CHAINS.map(async (chain) => {
    const tokenPromises = [
      processToken(YUSD_CONTRACTS[chain], 'yUSD', chain),
      processToken(VYUSD_CONTRACTS[chain], 'vyUSD', chain)
    ];

    // Only process yETH, vyETH, yBTC, vyBTC on Ethereum
    if (chain === 'ethereum') {
      tokenPromises.push(
        processToken(YETH_CONTRACTS[chain], 'yETH', chain),
        processToken(VYETH_CONTRACTS[chain], 'vyETH', chain),
        processToken(YBTC_CONTRACTS[chain], 'yBTC', chain),
        processToken(VYBTC_CONTRACTS[chain], 'vyBTC', chain)
      );
    }

    const pools = await Promise.all(tokenPromises);
    return pools.filter(Boolean);
  });

  const chainResults = await Promise.all(chainPromises);
  
  // Flatten the results
  chainResults.forEach(pools => {
    allPools.push(...pools);
  });

  return allPools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://yield.fi/mint',
};
