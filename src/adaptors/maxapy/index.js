const utils = require('../utils');

const VAULTS = {
  ethereum: {
    '0x9847c14FCa377305c8e2D10A760349c667c367d4': {
      symbol: 'WETH',
      underlying: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2',
      apy: 0.0 // Fallback APY when API fails
    },
    '0x349c996C4a53208b6EB09c103782D86a3F1BB57E': {
      symbol: 'USDC',
      underlying: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
      apy: 0.0
    }
  },
  polygon: {
    '0xA02aA8774E8C95F5105E33c2f73bdC87ea45BD29': {
      symbol: 'WETH', 
      underlying: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619',
      apy: 0.0
    },
    '0xE7FE898A1EC421f991B807288851241F91c7e376': {
      symbol: 'USDC',
      underlying: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
      apy: 0.0
    }
  }
};

const CHAIN_IDS = {
  ethereum: 1,
  polygon: 137
};

// Helper function to fetch APY data for a single vault
const fetchVaultApy = async (chainId, vaultAddress) => {
  try {
    const data = await utils.getData(
      `https://api.maxapy.io/apys?chainId=${chainId}&vault=${vaultAddress}`
    );
    return data;
  } catch (error) {
    console.error(`Error fetching data for vault ${vaultAddress} on chainId ${chainId}:`, error);
    return null;
  }
};

const getApy = async () => {
  // Create pools for all vaults in VAULTS config
  const pools = Object.entries(VAULTS).flatMap(([chain, vaults]) => 
    Object.entries(vaults).map(([vaultAddress, info]) => {
      return {
        pool: `${vaultAddress}-${chain}`.toLowerCase(),
        chain: utils.formatChain(chain),
        project: 'maxapy',
        symbol: utils.formatSymbol(info.symbol),
        tvlUsd: 0, // You might want to fetch this from another source
        apyBase: info.apy,
        underlyingTokens: [info.underlying],
        url: `https://app.maxapy.io/vaults/${chain}/${info.symbol}`
      };
    })
  );

  // Try to update APYs where possible, but keep default values if API fails
  const apy_promises = pools.map(async (pool) => {
    const [vaultAddress, chain] = pool.pool.split('-');
    const chainId = CHAIN_IDS[chain];
    
    try {
      const apyData = await fetchVaultApy(chainId, vaultAddress);
      if (apyData) {
        pool.apyBase = apyData.vaultNetWeightedApy * 100;
        if (apyData.strategies?.[0]?.strategyTvlUsd) {
          pool.tvlUsd = apyData.strategies.reduce((acc, s) => acc + s.strategyTvlUsd, 0);
        }
      }
    } catch (error) {
      console.log(`Using fallback values for ${pool.pool}`);
    }
    
    return pool;
  });

  // Wait for all promises and filter out any invalid pools
  const updated_pools = await Promise.all(apy_promises);
  return updated_pools.filter(pool => utils.keepFinite(pool));
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.maxapy.io/vaults'
};;
