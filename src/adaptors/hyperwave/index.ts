/**
 * @fileoverview Hyperwave Finance vault adapter for calculating TVL and APR metrics
 * This module interfaces with the hwHLP vault contract and its accountant to fetch
 * financial metrics across Ethereum and Hyperliquid chains.
 *
 * @author maybeYonas
 * @version 1.1.0
 */

const utils = require('../utils');
const ethers = require('ethers');
const axios = require('axios');
const sdk = require('@defillama/sdk');
const Vault = require('./Vault.json');
const Accountant = require('./Accountant.json');

const hwHLP = '0x9FD7466f987Fd4C45a5BBDe22ED8aba5BC8D72d1';
const hwHYPE = '0x4DE03cA1F02591B717495cfA19913aD56a2f5858';

const hwHLP_ACCOUNTANT = '0x78E3Ac5Bf48dcAF1835e7F9861542c0D43D0B03E';
const hwHYPE_ACCOUNTANT = '0xCf9be8BF79ad26fdD7aA73f3dd5bA73eCDee2a32';

const hwHLP_UNDERLYING_USDC = '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'; // USDC
const hwHLP_UNDERLYING_USDT0 = '0xB8CE59FC3717ada4C02eaDF9682A9e934F625ebb';
const hwHYPE_UNDERLYING_WHYPE = '0x5555555555555555555555555555555555555555'

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
    symbol: 'hwHLP',
    boringVault: hwHLP,
    accountant: hwHLP_ACCOUNTANT,
    underlying: hwHLP_UNDERLYING_USDC,
    decimals: 6,
    chain: 'ethereum',
  },
  {
    symbol: 'hwHLP',
    boringVault: hwHLP,
    accountant: hwHLP_ACCOUNTANT,
    underlying: hwHLP_UNDERLYING_USDT0,
    decimals: 6,
    chain: 'hyperliquid',
  },
  {
    symbol: 'hwHYPE',
    boringVault: hwHYPE,
    accountant: hwHYPE_ACCOUNTANT,
    underlying: hwHYPE_UNDERLYING_WHYPE,
    decimals: 18,
    chain: 'hyperliquid',
  },
];

/**
 * Calculate TVL (Total Value Locked) for the vault
 *
 * Fetches the total supply of vault tokens, current exchange rate from the accountant,
 * and underlying asset price to compute the total USD value locked in the vault.
 *
 * @async
 * @function calculateTVL
 * @param {string} chain - The blockchain network identifier (e.g., 'ethereum', 'hyperliquid')
 * @returns {Promise<Object>} Object containing TVL metrics
 * @returns {number} returns.tvlUsd - Total Value Locked in USD
 * @returns {number} returns.decimals - Token decimals for the vault
 * @returns {number} returns.scalingFactor - 10^decimals used for calculations
 * @returns {string} returns.currentRate - Current exchange rate from accountant contract
 *
 * @throws {Error} Throws error if contract calls fail or price data is unavailable
 *
 * @example
 * const tvlData = await calculateTVL('ethereum');
 * console.log(`TVL: $${tvlData.tvlUsd.toFixed(2)}`);
 */
const calculateTVL = async (config: AssetConfig) => {
  const {chain, underlying, accountant, boringVault, decimals} = config;
  const totalSupplyCall = sdk.api.abi.call({
    target: boringVault,
    abi: Vault.find((m) => m.name === 'totalSupply'),
    chain: chain,
  });

  const priceKey = `${chain}:${underlying}`;
  const underlyingPriceCall = axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}?searchWidth=24h`
  );

  const currentRateCall = sdk.api.abi.call({
    target: accountant,
    abi: Accountant.find((m) => m.name === 'getRate'),
    chain: chain,
  });

  const [
    totalSupplyResponse,
    underlyingPriceResponse,
    currentRateResponse,
  ] = await Promise.all([
    totalSupplyCall,
    underlyingPriceCall,
    currentRateCall,
  ]);

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
 *
 * @async
 * @function calculateAPR
 * @param {string|number} currentRate - Current exchange rate from the accountant contract
 * @param {number} scalingFactor - Scaling factor (10^decimals) for rate calculations
 * @param {string} [chain='ethereum'] - Blockchain network for historical block data
 * @returns {Promise<Object>} Object containing APR calculations
 * @returns {number} returns.apr1d - 1-day APR as a percentage
 * @returns {number} returns.apr7d - 7-day APR as a percentage
 *
 * @throws {Error} Throws error if historical block data or contract calls fail
 *
 * @example
 * const aprData = await calculateAPR('1000000000000000000', 1e18, 'ethereum');
 * console.log(`1d APR: ${aprData.apr1d.toFixed(2)}%`);
 * console.log(`7d APR: ${aprData.apr7d.toFixed(2)}%`);
 */
const calculateAPR = async (config: AssetConfig, currentRate: number) => {
  const {chain, accountant,decimals} = config;
  const scalingFactor = 10 ** decimals;

  if (chain === 'hyperliquid') {
    console.log("Setting provider for hyperliquid");
    sdk.api.config.setProvider(
      'hyperliquid', 
      new ethers.providers.JsonRpcProvider('https://rpc.hyperlend.finance')
    )
  }

  const now = Math.floor(Date.now() / 1000);
  const timestamp1dayAgo = now - 86400;
  const timestamp7dayAgo = now - 86400 * 7;

  const block1dayAgoCall = axios.get(
    `https://coins.llama.fi/block/${chain}/${timestamp1dayAgo}`
  );
  const block7dayAgoCall = axios.get(
    `https://coins.llama.fi/block/${chain}/${timestamp7dayAgo}`
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
      abi: Accountant.find((m) => m.name === 'getRate'),
      block: block1dayAgo,
      chain: chain,
      // provider
    }),
    sdk.api.abi.call({
      target: accountant,
      abi: Accountant.find((m) => m.name === 'getRate'),
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
 * Processes all configured chains to calculate TVL and APR metrics for the hwHLP vault.
 * Returns standardized pool data for each chain that can be consumed by DeFi dashboards.
 * Note: APR calculations use Ethereum chain for historical data due to archival state limitations
 * on HyperEVM RPCs.
 *
 * @async
 * @function apy
 * @returns {Promise<Array<Object>>} Array of pool objects with metrics for each chain
 * @returns {string} returns[].pool - Unique pool identifier (chain_contractAddress)
 * @returns {string} returns[].project - Project name ('hyperwave')
 * @returns {string} returns[].chain - Formatted chain name
 * @returns {string} returns[].symbol - Token symbol ('hwHLP')
 * @returns {number} returns[].tvlUsd - Total Value Locked in USD
 * @returns {number} returns[].apyBase - 1-day APR as base yield percentage
 * @returns {number} returns[].apyBase7d - 7-day APR as base yield percentage
 * @returns {Array<string>} returns[].underlyingTokens - Array of underlying token addresses
 *
 * @throws {Error} Throws error if TVL or APR calculations fail for any configured chain
 *
 * @example
 * const poolData = await apy();
 * poolData.forEach(pool => {
 *   console.log(`${pool.chain}: TVL $${pool.tvlUsd.toFixed(2)}, APR ${pool.apyBase.toFixed(2)}%`);
 * });
 */
const apy = async () => {
  const out = await Promise.all(
    config.map(async (chainConfig) => {
      const { tvlUsd, currentRate } = await calculateTVL(
        chainConfig
      );
      // using ethereum for APR as most HyperEVM RPCs don't have archival state
      // const { apr1d, apr7d } = await calculateAPR(currentRate, scalingFactor);
      const { apr1d, apr7d } = await calculateAPR(chainConfig, currentRate, );
      return {
        pool: `${chainConfig.chain}_${hwHLP}`,
        project: 'hyperwave',
        chain: utils.formatChain(chainConfig.chain),
        symbol: 'hwHLP',
        tvlUsd: tvlUsd,
        apyBase: apr1d,
        apyBase7d: apr7d,
        underlyingTokens: [chainConfig.underlying],
      };
    })
  );

  return out;
};

module.exports = {
  apy,
  timetravel: false,
  url: 'https://app.hyperwavefi.xyz/assets/hwhlp',
};
