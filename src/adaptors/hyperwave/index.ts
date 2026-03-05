/**
 * @fileoverview Hyperwave Finance vault adapter for calculating TVL and APR metrics
 * This module interfaces with Hyperwave vault contracts (hwHLP and hwHYPE) and their
 * accountants to fetch financial metrics across Ethereum and Hyperliquid chains.
 *
 * @author maybeYonas
 * @version 1.1.1
 */

const utils = require("../utils");
const ethers = require("ethers");
const axios = require("axios");
const sdk = require("@defillama/sdk");
const Vault = require("./Vault.json");
const Accountant = require("./Accountant.json");

const hwHLP = "0x9FD7466f987Fd4C45a5BBDe22ED8aba5BC8D72d1";
const hwHYPE = "0x4DE03cA1F02591B717495cfA19913aD56a2f5858";
const hwUSD = "0xa2f8Da4a55898B6c947Fa392eF8d6BFd87A4Ff77"

const hwHLP_ACCOUNTANT = "0x78E3Ac5Bf48dcAF1835e7F9861542c0D43D0B03E";
const hwHYPE_ACCOUNTANT = "0xCf9be8BF79ad26fdD7aA73f3dd5bA73eCDee2a32";
const hwUSD_ACCOUNTANT = "0xa77F32BaDEeA2d2B7De78680C3A6d8B88C46055D";

const hwHLP_UNDERLYING_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // USDC
const hwHLP_UNDERLYING_USDT0 = "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb";
const hwHYPE_UNDERLYING_WHYPE = "0x5555555555555555555555555555555555555555";
const hwUSD_UNDERLYING_USDC = "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"; // USDC
const hwUSD_UNDERLYING_USDT0 = "0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb";
const hwUSD_UNDERLYING_USDC_BASE = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"; // USDC on base

interface AssetConfig {
  symbol: string;
  boringVault: string;
  accountant: string;
  underlying: string;
  decimals: number;
  chain: string;
}

const config: AssetConfig[] = [
  {
    symbol: "hwHLP",
    boringVault: hwHLP,
    accountant: hwHLP_ACCOUNTANT,
    underlying: hwHLP_UNDERLYING_USDC,
    decimals: 6,
    chain: "ethereum",
  },
  {
    symbol: "hwHLP",
    boringVault: hwHLP,
    accountant: hwHLP_ACCOUNTANT,
    underlying: hwHLP_UNDERLYING_USDT0,
    decimals: 6,
    chain: "hyperliquid",
  },
  {
    symbol: "hwHYPE",
    boringVault: hwHYPE,
    accountant: hwHYPE_ACCOUNTANT,
    underlying: hwHYPE_UNDERLYING_WHYPE,
    decimals: 18,
    chain: "hyperliquid",
  },
  {
    symbol: "hwUSD",
    boringVault: hwUSD,
    accountant: hwUSD_ACCOUNTANT,
    underlying: hwUSD_UNDERLYING_USDT0,
    decimals: 6,
    chain: "hyperliquid",
  },
  {
    symbol: "hwUSD",
    boringVault: hwUSD,
    accountant: hwUSD_ACCOUNTANT,
    underlying: hwUSD_UNDERLYING_USDC,
    decimals: 6,
    chain: "ethereum",
  },
  {
    symbol: "hwUSD",
    boringVault: hwUSD,
    accountant: hwUSD_ACCOUNTANT,
    underlying: hwUSD_UNDERLYING_USDC_BASE,
    decimals: 6,
    chain: "base",
  },
];

/**
 * Calculate TVL (Total Value Locked) for a vault
 *
 * Fetches the total supply of vault tokens, current exchange rate from the accountant,
 * and underlying asset price to compute the total USD value locked in the vault.
 * Supports both hwHLP and hwHYPE vaults across different chains.
 *
 * @async
 * @function calculateTVL
 * @param {AssetConfig} config - Configuration object containing vault details
 * @returns {Promise<Object>} Object containing TVL metrics
 * @returns {number} returns.tvlUsd - Total Value Locked in USD
 * @returns {string} returns.currentRate - Current exchange rate from accountant contract
 *
 * @throws {Error} Throws error if contract calls fail or price data is unavailable
 *
 * @example
 * const tvlData = await calculateTVL(configObject);
 * console.log(`TVL: $${tvlData.tvlUsd.toFixed(2)}`);
 */
const calculateTVL = async (config: AssetConfig) => {
  const { chain, underlying, accountant, boringVault, decimals } = config;
  const totalSupplyCall = sdk.api.abi.call({
    target: boringVault,
    abi: Vault.find((m) => m.name === "totalSupply"),
    chain: chain,
  });

  const priceKey = `${chain}:${underlying}`;
  const underlyingPriceCall = axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}?searchWidth=24h`,
  );

  const currentRateCall = sdk.api.abi.call({
    target: accountant,
    abi: Accountant.find((m) => m.name === "getRate"),
    chain: chain,
  });

  const [totalSupplyResponse, underlyingPriceResponse, currentRateResponse] =
    await Promise.all([totalSupplyCall, underlyingPriceCall, currentRateCall]);

  const scalingFactor = 10 ** decimals;
  const totalSupply = totalSupplyResponse.output / scalingFactor;
  const underlyingPrice = underlyingPriceResponse.data.coins[priceKey].price;
  const currentRate = currentRateResponse.output;

  const tvlUsd = totalSupply * (currentRate / scalingFactor) * underlyingPrice;

  return {
    tvlUsd,
    currentRate,
  };
};

/**
 * Calculate APR (Annual Percentage Rate) for 1 day and 7 days
 *
 * Computes yield rates by comparing the current exchange rate with historical rates
 * from 1 day and 7 days ago. Uses block height data to fetch historical contract state.
 * Supports both hwHLP and hwHYPE vaults with appropriate decimal scaling.
 *
 * @async
 * @function calculateAPR
 * @param {AssetConfig} config - Configuration object containing vault and chain details
 * @param {string|number} currentRate - Current exchange rate from the accountant contract
 * @returns {Promise<Object>} Object containing APR calculations
 * @returns {number} returns.apr1d - 1-day APR as a percentage
 * @returns {number} returns.apr7d - 7-day APR as a percentage
 *
 * @throws {Error} Throws error if historical block data or contract calls fail
 *
 * @example
 * const aprData = await calculateAPR(configObject, currentRate);
 * console.log(`1d APR: ${aprData.apr1d.toFixed(2)}%`);
 * console.log(`7d APR: ${aprData.apr7d.toFixed(2)}%`);
 */
const calculateAPR = async (config: AssetConfig, currentRate: number) => {
  const { chain, accountant, decimals } = config;
  const scalingFactor = 10 ** decimals;

  const now = Math.floor(Date.now() / 1000);
  const timestamp1dayAgo = now - 86400;
  const timestamp7dayAgo = now - 86400 * 7;

  const block1dayAgoCall = axios.get(
    `https://coins.llama.fi/block/${chain}/${timestamp1dayAgo}`,
  );
  const block7dayAgoCall = axios.get(
    `https://coins.llama.fi/block/${chain}/${timestamp7dayAgo}`,
  );

  const [block1dayAgoResponse, block7dayAgoResponse] = await Promise.all([
    block1dayAgoCall,
    block7dayAgoCall,
  ]);

  const block1dayAgo = block1dayAgoResponse.data.height;
  const block7dayAgo = block7dayAgoResponse.data.height;

  const [rate1dayAgo, rate7dayAgo] = await Promise.all([
    sdk.api.abi.call({
      target: accountant,
      abi: Accountant.find((m) => m.name === "getRate"),
      block: block1dayAgo,
      chain: chain,
      // provider
    }),
    sdk.api.abi.call({
      target: accountant,
      abi: Accountant.find((m) => m.name === "getRate"),
      block: block7dayAgo,
      chain: chain,
    }),
  ]);

  // console.log("Rates:", {
  //   chain,
  //   currentRate,
  //   rate1dayAgo: rate1dayAgo.output,
  //   rate7dayAgo: rate7dayAgo.output,
  //   block1dayAgo,
  //   block7dayAgo
  // });

  const apr1d =
    ((currentRate - rate1dayAgo.output) / scalingFactor) * 365 * 100;
  const apr7d =
    ((currentRate - rate7dayAgo.output) / scalingFactor / 7) * 365 * 100;

  return {
    apr1d,
    apr7d,
  };
};

/**
 * Main function that orchestrates TVL and APR calculations
 *
 * Processes all configured vaults (hwHLP and hwHYPE) to calculate TVL and APR metrics
 * across Ethereum and Hyperliquid chains. Returns standardized pool data for each
 * vault configuration that can be consumed by DeFi dashboards.
 *
 * @async
 * @function apy
 * @returns {Promise<Array<Object>>} Array of pool objects with metrics for each vault configuration
 * @returns {string} returns[].pool - Unique pool identifier (chain_contractAddress)
 * @returns {string} returns[].project - Project name ('hyperwave')
 * @returns {string} returns[].chain - Formatted chain name
 * @returns {string} returns[].symbol - Token symbol ('hwHLP' or 'hwHYPE')
 * @returns {number} returns[].tvlUsd - Total Value Locked in USD
 * @returns {number} returns[].apyBase - 1-day APR as base yield percentage
 * @returns {number} returns[].apyBase7d - 7-day APR as base yield percentage
 * @returns {Array<string>} returns[].underlyingTokens - Array of underlying token addresses
 *
 * @throws {Error} Throws error if TVL or APR calculations fail for any configured vault
 *
 * @example
 * const poolData = await apy();
 * poolData.forEach(pool => {
 *   console.log(`${pool.symbol} ${pool.chain}: TVL $${pool.tvlUsd.toFixed(2)}, APR ${pool.apyBase.toFixed(2)}%`);
 * });
 */
const apy = async () => {
  const out = await Promise.all(
    config.map(async (chainConfig) => {
      const { tvlUsd, currentRate } = await calculateTVL(chainConfig);
      // using ethereum for APR as most HyperEVM RPCs don't have archival state
      // const { apr1d, apr7d } = await calculateAPR(currentRate, scalingFactor);
      const { apr1d, apr7d } = await calculateAPR(chainConfig, currentRate);
      return {
        pool: `${chainConfig.chain}_${chainConfig.boringVault}`,
        project: "hyperwave",
        chain: utils.formatChain(chainConfig.chain),
        symbol: chainConfig.symbol,
        tvlUsd: tvlUsd,
        apyBase: apr1d,
        apyBase7d: apr7d,
        underlyingTokens: [chainConfig.underlying],
      };
    }),
  );

  return out;
};

module.exports = {
  apy,
  timetravel: false,
  url: "https://app.hyperwavefi.xyz/assets/hwhlp",
};
