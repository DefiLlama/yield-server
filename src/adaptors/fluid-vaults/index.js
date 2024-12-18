const axios = require('axios');
const sdk = require('@defillama/sdk');

const utils = require('../utils');

// Constants
const CONSTANTS = {
  CHAIN_ID_MAPPING: {
    ethereum: 1,
    arbitrum: 42161,
    base: 8453,
  },
  VAULT_RESOLVERS: {
    ethereum: '0x814c8C7ceb1411B364c2940c4b9380e739e06686',
    arbitrum: '0xD7D455d387d7840F56C65Bb08aD639DE9244E463',
    base: '0x79B3102173EB84E6BCa182C7440AfCa5A41aBcF8',
  },
  PROJECT_SLUG: 'fluid-vaults',
  SUPPORTED_CHAINS: ['ethereum', 'arbitrum', 'base'],
};

// Import ABI
const abiVaultResolver = require('./abiVaultResolver');

/**
 * Fetch and process vault APY data for a specific chain
 * @param {string} chain - Blockchain network name
 * @returns {Promise<Array>} Processed vault pools data
 */
const getApy = async (chain) => {
  try {
    // Fetch vault data
    const vaultsEntireData = await fetchVaultsData(chain);

    // Filter and process vaults
    const filteredVaults = filterT1Vaults(vaultsEntireData);

    // Extract vault details
    const vaultDetails = extractVaultDetails(filteredVaults);

    // Fetch token prices and decimals
    const tokenPricesAndDecimals = await fetchTokenPricesSymbolAndDecimals(
      chain,
      vaultDetails
    );

    // Calculate pool data
    return calculatePoolData(
      chain,
      filteredVaults,
      vaultDetails,
      tokenPricesAndDecimals
    );
  } catch (error) {
    console.error(`Error fetching APY for ${chain}:`, error);
    return [];
  }
};

/**
 * Fetch vault data using SDK
 * @param {string} chain - Blockchain network name
 * @returns {Promise<Array>} Raw vault data
 */
const fetchVaultsData = async (chain) => {
  const vaultsEntireDataResponse = await sdk.api.abi.call({
    target: CONSTANTS.VAULT_RESOLVERS[chain],
    abi: abiVaultResolver.find((m) => m.name === 'getVaultsEntireData'),
    chain,
  });

  return vaultsEntireDataResponse.output;
};

/**
 * Filter T1 vaults
 * @param {Array} vaultsEntireData - T1 vault data
 * @returns {Array} Filtered T1 vaults
 */
const filterT1Vaults = (vaultsEntireData) =>
  vaultsEntireData.filter((vault) => vault[1] === false && vault[2] === false);

/**
 * Extract vault details
 * @param {Array} filteredVaults - Filtered active vaults
 * @returns {Object} Extracted vault details
 */
const extractVaultDetails = (filteredVaults) => ({
  pools: filteredVaults.map((vault) => vault[0]),
  underlyingTokens: filteredVaults.map((vault) => [
    String(vault[3][8][0]).toLowerCase() ===
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      ? '0x0000000000000000000000000000000000000000'
      : String(vault[3][8][0]),
    String(vault[3][9][0]).toLowerCase() ===
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      ? '0x0000000000000000000000000000000000000000'
      : String(vault[3][9][0]),
  ]),
  rewardsRates: filteredVaults.map((vault) => Math.max(0, vault[5][12])),
  rewardsRatesBorrow: filteredVaults.map((vault) => Math.max(0, vault[5][13])),
  supplyRates: filteredVaults.map((vault) => Math.max(0, vault[5][8])),
  supplyRatesBorrow: filteredVaults.map((vault) => Math.max(0, vault[5][9])),
  suppliedTokens: filteredVaults.map((vault) => vault[8][5]),
  supplyTokens: filteredVaults.map((vault) =>
    String(vault[3][8][0]).toLowerCase() ===
    '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
      ? '0x0000000000000000000000000000000000000000'
      : String(vault[3][8][0])
  ),
});

/**
 * Fetch token prices and decimals
 * @param {string} chain - Blockchain network name
 * @param {Object} vaultDetails - Extracted vault details
 * @returns {Promise<Object>} Token prices and decimals
 */
const fetchTokenPricesSymbolAndDecimals = async (chain, vaultDetails) => {
  const priceKeys = vaultDetails.supplyTokens
    .map((token) => `${chain}:${token}`)
    .join(',');
  const borrowPriceKeys = vaultDetails.underlyingTokens
    .map((tokens) => `${chain}:${tokens[1]}`)
    .join(',');
  const prices = await fetchTokenPrices(priceKeys);
  const borrowPrices = await fetchTokenPrices(borrowPriceKeys);

  return {
    symbol: vaultDetails.underlyingTokens.map(
      (tokens) =>
        prices[`${chain}:${tokens[0]}`].symbol +
        '/' +
        borrowPrices[`${chain}:${tokens[1]}`].symbol
    ),
    decimals: vaultDetails.supplyTokens.map(
      (token) => prices[`${chain}:${token}`].decimals
    ),
    prices: vaultDetails.supplyTokens.map(
      (token) => prices[`${chain}:${token}`].price
    ),
  };
};

/**
 * Fetch token decimals
 * @param {string} chain - Blockchain network name
 * @param {Array} calls - Decimals calls
 * @returns {Array} Token decimals
 */
const fetchDecimals = async (chain, calls) => {
  const decimalResponses = await sdk.api.abi.multiCall({
    calls: calls.filter((call) => call !== null),
    abi: 'erc20:decimals',
    chain,
  });

  const decimals = decimalResponses.output.map((response) => response.output);
 
  // Reinsert 18 for native token addresses
  const nativeTokenIndexes = calls.reduce(
    (acc, call, idx) => (call === null ? [...acc, idx] : acc),
    []
  );

  decimals.splice(0, 0, ...nativeTokenIndexes.map(() => 18));

  return decimals;
};

/**
 * Fetch token prices
 * @param {string} priceKeys - Comma-separated price keys
 * @returns {Promise<Object>} Token prices
 */
const fetchTokenPrices = async (priceKeys) => {
  const response = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKeys}`
  );
  return response.data.coins;
};

/**
 * Calculate pool data
 * @param {string} chain - Blockchain network name
 * @param {Array} filteredVaults - Filtered active vaults
 * @param {Object} vaultDetails - Extracted vault details
 * @param {Object} tokenPricesAndDecimals - Token prices and decimals
 * @returns {Array} Processed pool data
 */
const calculatePoolData = (
  chain,
  filteredVaults,
  vaultDetails,
  { symbol, decimals, prices }
) => {
  const totalSupplyUsd = vaultDetails.suppliedTokens.map(
    (suppliedToken, index) =>
      (suppliedToken * prices[index]) / 10 ** decimals[index]
  );

  return filteredVaults
    .map((vault, index) => ({
      project: CONSTANTS.PROJECT_SLUG,
      pool: vaultDetails.pools[index],
      tvlUsd: totalSupplyUsd[index],
      symbol: symbol[index].replace('.base', ''),
      underlyingTokens: vaultDetails.underlyingTokens[index],
      rewardTokens: vaultDetails.underlyingTokens[index],
      chain,
      apyBase: Number((vaultDetails.supplyRates[index] / 1e2).toFixed(2)),
      apyBaseBorrow: Number(
        (vaultDetails.supplyRatesBorrow[index] / 1e2).toFixed(2)
      ),
      apyReward: Number((vaultDetails.rewardsRates[index] / 1e12).toFixed(2)),
      apyRewardBorrow: Number(
        (vaultDetails.rewardsRatesBorrow[index] / 1e12).toFixed(2)
      ),
    }))
    .filter((pool) => utils.keepFinite(pool));
};

/**
 * Fetch APY for supported chains
 * @returns {Promise<Array>} APY data for all chains
 */
const apy = async () => {
  const apyResults = await Promise.all(CONSTANTS.SUPPORTED_CHAINS.map(getApy));
  return apyResults.flat();
};

module.exports = {
  apy: apy,
  url: 'https://fluid.instadapp.io/vaults/',
};