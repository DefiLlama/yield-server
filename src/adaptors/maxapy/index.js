const utils = require('../utils');

const VAULTS = {
  ethereum: {
    '0x9847c14FCa377305c8e2D10A760349c667c367d4': {
      symbol: 'WETH',
      underlying: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2'
    },
    '0x349c996C4a53208b6EB09c103782D86a3F1BB57E': {
      symbol: 'USDC',
      underlying: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48'
    }
  },
  polygon: {
    '0xE7FE898A1EC421f991B807288851241F91c7e376': {
      symbol: 'WETH',
      underlying: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'
    },
    '0xA02aA8774E8C95F5105E33c2f73bdC87ea45BD29': {
      symbol: 'USDC',
      underlying: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
    }
  }
};

const CHAIN_IDS = {
  ethereum: 1,
  polygon: 137
};

// Helper function to validate APY data
const isValidApyResponse = (data) => {
  try {
    if (typeof data === 'string' && data.includes('<!DOCTYPE html>')) {
      return false;
    }

    return (
      data &&
      typeof data === 'object' &&
      typeof data.vaultNetWeightedApy === 'number' &&
      Array.isArray(data.strategies) &&
      data.strategies.length > 0 &&
      data.strategies.every(s => typeof s.strategyTvlUsd === 'number')
    );
  } catch (error) {
    return false;
  }
};

// Helper function to fetch APY data for a single vault with retries
const fetchVaultApy = async (chainId, vaultAddress, retries = 3) => {
  for (let i = 0; i < retries; i++) {
    try {
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
        'Accept': 'application/json',
        'Accept-Language': 'en-US,en;q=0.9',
        'Referer': 'https://app.maxapy.io/'
      };

      const data = await utils.getData(
        `api.maxapy.io/apys?chainId=${chainId}&vault=${vaultAddress}`,
        headers
      );

      if (isValidApyResponse(data)) {
        return data;
      }

      await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
    } catch (error) {
      if (i < retries - 1) {
        await new Promise(resolve => setTimeout(resolve, 1000 * (i + 1)));
      }
    }
  }
  return null;
};

const getApy = async () => {
  const poolsPromises = Object.entries(VAULTS).flatMap(([chain, vaults]) => 
    Object.entries(vaults).map(async ([vaultAddress, info]) => {
      try {
        const apyData = await fetchVaultApy(CHAIN_IDS[chain], vaultAddress);
        
        if (!apyData) {
          return null; // Skip pools where we can't get APY data
        }
        
        return {
          pool: `${vaultAddress}-${chain}`.toLowerCase(),
          chain: utils.formatChain(chain),
          project: 'maxapy',
          symbol: utils.formatSymbol(info.symbol),
          tvlUsd: apyData.strategies.reduce((acc, strat) => acc + strat.strategyTvlUsd, 0),
          apyBase: apyData.vaultNetWeightedApy * 100,
          underlyingTokens: [info.underlying],
          url: `https://app.maxapy.io/vaults/${chain}/${info.symbol}`
        };
      } catch (error) {
        console.error(`Error processing vault ${vaultAddress} on ${chain}:`, error);
        return null;
      }
    })
  );

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
};;
