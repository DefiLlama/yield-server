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
    '0xA02aA8774E8C95F5105E33c2f73bdC87ea45BD29': {
      symbol: 'WETH',
      underlying: '0x7ceB23fD6bC0adD59E62ac25578270cFf1b9f619'
    },
    '0xE7FE898A1EC421f991B807288851241F91c7e376': {
      symbol: 'USDC',
      underlying: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174'
    }
  }
};

const CHAIN_IDS = {
  ethereum: 1,
  polygon: 137
};

class MaxApyAdapter {
  constructor() {
    this.baseUrl = 'https://api.maxapy.io';
    this.projectUrl = 'https://app.maxapy.io/vaults';
  }

  createPoolObject(vaultAddress, chain, vaultInfo) {
    return {
      pool: `${vaultAddress}-${chain}`.toLowerCase(),
      chain: utils.formatChain(chain),
      project: 'maxapy',
      symbol: utils.formatSymbol(vaultInfo.symbol),
      tvlUsd: 0,
      apyBase: 0,
      underlyingTokens: [vaultInfo.underlying],
      url: `${this.projectUrl}/${chain}/${vaultInfo.symbol}`
    };
  }

  async fetchVaultApy(chainId, vaultAddress) {
    try {
      return await utils.getData(
        `${this.baseUrl}/apys?chainId=${chainId}&vault=${vaultAddress}`
      );
    } catch (error) {
      console.error(
        `Failed to fetch APY for vault ${vaultAddress} on chain ${chainId}:`,
        error.message
      );
      return null;
    }
  }

  updatePoolWithApyData(pool, apyData) {
    if (!apyData) return pool;

    const strategies = apyData.strategies || [];
    
    return {
      ...pool,
      apyBase: apyData.vaultNetWeightedApy * 100,
      tvlUsd: strategies.reduce((acc, strategy) => 
        acc + (strategy.strategyTvlUsd || 0), 0
      )
    };
  }

  async getApy() {
    try {
      const poolPromises = Object.entries(VAULTS).flatMap(([chain, vaults]) =>
        Object.entries(vaults).map(async ([vaultAddress, vaultInfo]) => {
          // Create initial pool object
          const pool = this.createPoolObject(vaultAddress, chain, vaultInfo);
          
          // Fetch and update APY data
          const chainId = CHAIN_IDS[chain];
          const apyData = await this.fetchVaultApy(chainId, vaultAddress);
          
          return this.updatePoolWithApyData(pool, apyData);
        })
      );

      const pools = await Promise.all(poolPromises);
      return pools.filter(utils.keepFinite);
      
    } catch (error) {
      console.error('Failed to fetch APY data:', error);
      return [];
    }
  }
}

module.exports = {
  timetravel: false,
  apy: () => new MaxApyAdapter().getApy(),
  url: 'https://app.maxapy.io/vaults'
};
