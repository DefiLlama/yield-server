const utils = require('../utils');

const VAULTS = {
  ethereum: {
    '0x9847c14FCa377305c8e2D10A760349c667c367d4': {
      symbol: 'WETH',
      underlying: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'  // WETH address on Ethereum
    },
    '0x349c996C4a53208b6EB09c103782D86a3F1BB57E': {
      symbol: 'USDC',
      underlying: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'  // USDC address on Ethereum
    }
  },
  polygon: {
    '0xE7FE898A1EC421f991B807288851241F91c7e376': {
      symbol: 'WETH',
      underlying: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'  // WETH address on Polygon
    },
    '0xA02aA8774E8C95F5105E33c2f73bdC87ea45BD29': {
      symbol: 'USDC',
      underlying: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'  // USDC address on Polygon
    }
  }
};

const CHAIN_IDS = {
  ethereum: 1,
  polygon: 137
};

// Helper function to fetch APY data for a single vault
const fetchVaultApy = async (chainId, vaultAddress) => {
  const data = await utils.getData(
    `api.maxapy.io/apys?chainId=${chainId}&vault=${vaultAddress}`
  );
  return data;
};

const getApy = async () => {
  // Fetch data for all vaults across all chains
  const poolsPromises = Object.entries(VAULTS).flatMap(([chain, vaults]) => 
    Object.entries(vaults).map(async ([vaultAddress, tokenInfo]) => {
      try {
        const apyData = await fetchVaultApy(CHAIN_IDS[chain], vaultAddress);
        
        // Calculate total APY including fees
        const baseApy = apyData.vaultNetWeightedApy * 100; // Convert to percentage
        
        return {
          pool: `${vaultAddress}-${chain}`.toLowerCase(), // Unique identifier
          chain: utils.formatChain(chain),
          project: 'maxapy', // Must match the adapter filename and be in protocols slug
          symbol: utils.formatSymbol(tokenInfo.symbol),
          tvlUsd: apyData.strategies.reduce((acc, strat) => acc + strat.strategyTvlUsd, 0),
          apyBase: baseApy,
          underlyingTokens: [tokenInfo.underlying],
          url: `https://app.maxapy.io/vaults/${chain}/${tokenInfo.symbol}`,
        };
      } catch (error) {
        console.error(`Error fetching data for vault ${vaultAddress} on ${chain}:`, error);
        return null;
      }
    })
  );

  // Wait for all promises to resolve
  const pools = await Promise.all(poolsPromises);

  // Filter out null values (failed requests) and ensure all numbers are finite
  return pools
    .filter(Boolean)
    .filter(pool => utils.keepFinite(pool));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.maxapy.io/vaults'
};
