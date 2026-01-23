const sdk = require('@defillama/sdk');
const { default: BigNumber } = require('bignumber.js');
const utils = require('../utils');
const config = require('./config');

const OCTO_POOL_APR_URL = 'https://api.symbiosis.finance/crosschain/v1/octo-pool-apr';

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

// Load TVL data by querying token balances in portal contracts
const loadTvlData = async () => {
  const tvlData = {};
  
  // Get all pools (EVM and Tron, excluding TON)
  const pools = Object.entries(config.sTokenPools)
    .filter(([_, pool]) => !pool.isTon)
    .map(([sToken, pool]) => ({ sToken, ...pool }));
  
  // Query all chains in parallel
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
        const tvlUsd = balance.div(new BigNumber(10).pow(pool.decimals)).toNumber();
        
        tvlData[pool.sToken] = tvlUsd;
      } catch (err) {
        console.log(`Failed to fetch TVL for ${pool.chain} ${pool.symbol}: ${err.message}`);
        tvlData[pool.sToken] = 0;
      }
    })
  );
  
  return tvlData;
};

// Map chain names to DefiLlama format
const formatChainName = (chain) => {
  const chainMap = {
    ethereum: 'Ethereum',
    bsc: 'Binance',
    polygon: 'Polygon',
    avax: 'Avalanche',
    boba: 'Boba',
    telos: 'Telos',
    era: 'zkSync Era',
    arbitrum: 'Arbitrum',
    optimism: 'Optimism',
    arbitrum_nova: 'Arbitrum Nova',
    polygon_zkevm: 'Polygon zkEVM',
    linea: 'Linea',
    mantle: 'Mantle',
    base: 'Base',
    scroll: 'Scroll',
    manta: 'Manta',
    ftn: 'Bahamut',
    cronos: 'Cronos',
    rsk: 'RSK',
    xdai: 'Gnosis',
    tron: 'Tron',
    ton: 'TON',
    sei: 'Sei',
    cronos_zkevm: 'Cronos zkEVM',
    hyperliquid: 'Hyperliquid',
    gravity: 'Gravity',
    kava: 'Kava',
    zeta: 'ZetaChain',
    plasma: 'Plasma',
    morph: 'Morph',
    katana: 'Katana',
  };
  return chainMap[chain] || utils.formatChain(chain);
};

const main = async () => {
  const [apyData, tvlData] = await Promise.all([
    loadApyData(),
    loadTvlData(),
  ]);

  const pools = [];
  
  for (const [sToken, poolConfig] of Object.entries(config.sTokenPools)) {
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
