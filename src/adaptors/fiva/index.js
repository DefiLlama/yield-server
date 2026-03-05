const utils = require('../utils');
const axios = require('axios');

// TON blockchain configuration
const TON_CHAIN = {
  chainName: 'ton',
  chainSlug: 'ton',
};

const TON_COINGECKO = {
  tsusde: 'coingecko:ethena-staked-usde',
  tston: 'coingecko:the-open-network',
  stton: 'coingecko:the-open-network',
  ton: 'coingecko:the-open-network',
  usdt: 'coingecko:tether',
  'usd₮': 'coingecko:tether',
  eusdt: 'coingecko:tether',
  usde: 'coingecko:ethena-usde',
  stgusd: 'coingecko:usd-coin',
};
const resolveTonToken = (symbol, address) => TON_COINGECKO[symbol?.toLowerCase()] || address;

function expiryToText(dateIso) {
  return new Date(dateIso)
    .toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    })
    .replace(/ /g, '')
    .toUpperCase();
}

function createLpPools(assets) {
  return assets
    .filter(asset => asset.pool_liquidity_usd > 0)
    .map((asset) => ({
      pool: asset.jettons.lp.master_address.toLowerCase(),
      chain: utils.formatChain(TON_CHAIN.chainName),
      project: 'fiva',
      symbol: asset.jettons.lp.symbol.replace('LP ', ''),
      tvlUsd: asset.pool_liquidity_usd, // Use pool liquidity for LP pools
      apyBase: asset.pool_apr_7d, // Prefer 7-day APR
      apyReward: 0, // No separate reward system visible in API
      rewardTokens: [], // No reward tokens in current structure
      underlyingTokens: [resolveTonToken(asset.jettons.underlying_jetton.symbol, asset.jettons.underlying_jetton.master_address)],
      poolMeta: `For LP | Maturity ${expiryToText(asset.maturity_date)}`,
      url: `${asset.earn_url.replace('/fixed-yield/', '/pools/')}?dir=provide&strategy=auto-mint&access=DLAMA`,
    }));
}

function createPtPools(assets) {
  return assets
    .filter(asset => asset.pool_liquidity_usd > 0 && asset.pt_price_usd > 0)
    .map((asset) => ({
      pool: asset.jettons.pt.master_address.toLowerCase(),
      chain: utils.formatChain(TON_CHAIN.chainName),
      project: 'fiva',
      symbol: asset.jettons.pt.symbol.replace('PT ', ''),
      tvlUsd: asset.asset_tvl_usd,
      apyBase: asset.fixed_apr,
      underlyingTokens: [resolveTonToken(asset.jettons.underlying_jetton.symbol, asset.jettons.underlying_jetton.master_address)],
      poolMeta: `For buying ${asset.jettons.pt.symbol}-${expiryToText(asset.maturity_date)}`,
      url: asset.earn_url + "?access=DLAMA",
    }));
}

async function apy() {
  const poolsFiltered = [];

    try {
    const response = await axios.get('https://api2.thefiva.com/protocol_metrics');
    const assets = response.data.assets;

    // Create LP pools and PT pools
    const ptPools = createPtPools(assets);
    const lpPools = createLpPools(assets);
    
    // Combine all pools
    const allPools = [...lpPools, ...ptPools]
      .sort((a, b) => b.tvlUsd - a.tvlUsd);

    // Remove duplicates based on pool address
    const unique = new Set();
    for (const pool of allPools) {
      if (unique.has(pool.pool)) continue;
      poolsFiltered.push(pool);
      unique.add(pool.pool);
    }
  } catch (error) {
    console.error('Error fetching Fiva data:', error.message);
    return [];
  }

  return poolsFiltered;
}

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.thefiva.com',
};
