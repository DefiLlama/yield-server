const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const { sTokenPools, CHAIN_CONFIG } = require('./config');

const OCTO_POOL_APR_URL = 'https://api.symbiosis.finance/crosschain/v1/octo-pool-apr';

// Get chain name for DefiLlama price API
const getPriceApiChain = (chain, isTron) => {
  if (isTron) return 'tron';
  return CHAIN_CONFIG[chain]?.priceApi || chain;
};

// Format chain name for DefiLlama display
const formatChainName = (chain) => {
  return CHAIN_CONFIG[chain]?.display || utils.formatChain(chain);
};

// This API returns APR by sToken address on Symbiosis chain
const loadApyData = async () => {
  const response = await utils.getData(OCTO_POOL_APR_URL);

  const apyData = {};
  for (const item of response.aprData || []) {
    const sToken = item.token.toLowerCase();
    apyData[sToken] = item.apr;
  }
  return apyData;
};

// Load TVL data by querying token balances and fetching USD prices
const loadTvlData = async () => {
  const tvlData = {};

  // Get all pools (EVM and Tron, excluding TON)
  const pools = Object.entries(sTokenPools)
    .filter(([_, pool]) => !pool.isTon)
    .map(([sToken, pool]) => ({ sToken, ...pool }));

  // Build price keys for batch price lookup (chain:address format)
  const priceKeys = pools.map((pool) => {
    const priceChain = getPriceApiChain(pool.chain, pool.isTron);
    return `${priceChain}:${pool.token}`;
  });

  // Fetch all prices in a single batch request
  let prices = {};
  try {
    const priceResponse = await utils.getData(
      `https://coins.llama.fi/prices/current/${priceKeys.join(',').toLowerCase()}`
    );
    prices = priceResponse.coins || {};
  } catch (err) {
    console.log(`Failed to fetch prices: ${err.message}`);
  }

  // Query all token balances in parallel
  await Promise.all(
    pools.map(async (pool) => {
      try {
        const balanceResult = await sdk.api.abi.call({
          target: pool.token,
          params: pool.portal,
          chain: pool.isTron ? 'tron' : pool.chain,
          abi: 'erc20:balanceOf',
        });

        const balance = new BigNumber(balanceResult.output);
        const tokenAmount = balance.div(new BigNumber(10).pow(pool.decimals));

        // Get USD price for this token
        const priceChain = getPriceApiChain(pool.chain, pool.isTron);
        const priceKey = `${priceChain}:${pool.token}`.toLowerCase();
        const tokenPrice = prices[priceKey]?.price || 0;

        if (tokenPrice === 0) {
          console.log(`No price found for ${pool.chain} ${pool.symbol} (${priceKey})`);
        }

        tvlData[pool.sToken] = tokenAmount.times(tokenPrice).toNumber();
      } catch (err) {
        console.log(`Failed to fetch TVL for ${pool.chain} ${pool.symbol}: ${err.message}`);
        tvlData[pool.sToken] = 0;
      }
    })
  );

  return tvlData;
};

const main = async () => {
  const [apyData, tvlData] = await Promise.all([
    loadApyData(),
    loadTvlData(),
  ]);

  const pools = [];
  
  for (const [sToken, poolConfig] of Object.entries(sTokenPools)) {
    const { chain, symbol, token } = poolConfig;

    const tvlUsd = tvlData[sToken] || 0;
    const apr = apyData[sToken] || 0;

    // Skip pools with no TVL and no APR
    if (tvlUsd === 0 && apr === 0) continue;

    pools.push({
      pool: `symbiosis-${chain}-${symbol}`.toLowerCase().replace(/\./g, '-'),
      chain: formatChainName(chain),
      project: 'symbiosis',
      symbol,
      tvlUsd,
      apyBase: apr,
      underlyingTokens: [token],
    });
  }
  
  // Sort by TVL descending
  pools.sort((a, b) => b.tvlUsd - a.tvlUsd);
  
  return pools;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.symbiosis.finance/liquidity-v2/pools',
};
