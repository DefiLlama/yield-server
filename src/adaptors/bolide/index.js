const utils = require('../utils');

const MASTER_CHEF = '0x3782C47E62b13d579fe748946AEf7142B45B2cf7';

// Token addresses by chainId and symbol
const tokenAddresses = {
  // Ethereum (chainId: 1)
  1: {
    USDT: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    USDC: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    DAI: '0x6B175474E89094C44Da98b954EeadCfC6E03e6B5',
    BLID: '0x8A7aDc1B690E81c758F1BD0F72DFe27Ae6eC56A5',
  },
  // BSC (chainId: 56)
  56: {
    USDT: '0x55d398326f99059fF775485246999027B3197955',
    USDC: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d',
    BUSD: '0xe9e7CEA3DedcA5984780Bafc599bD69ADd087D56',
    DAI: '0x1AF3F329e8BE154074D8769D1FFa4eE058B1DBc3',
    BLID: '0x766AFcf83Fd5eaf884B3d529b432CA27A6d84617',
  },
  // Polygon (chainId: 137)
  137: {
    USDT: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    USDC: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
    DAI: '0x8f3Cf7ad23Cd3CaDbD9735AFf958023239c6A063',
    BLID: '0x4b27Cd6E6a5E83d236eAD376D256Fe2F9e9f0d2E',
  },
};

const poolsFunction = async () => {
  const data = await utils.getData('https://bolide.fi/api/v1/vaults/list');

  const pools = [];

  for (const vault of data.vaults) {
    for (const token of vault.tokens) {
      let poolAddress;

      if (vault.address === MASTER_CHEF) {
        if (token.name === 'BLID') {
          poolAddress = `${vault.address}0`;
        } else {
          poolAddress = `${vault.address}1`;
        }
      } else {
        poolAddress = `${vault.address}${token.name}`;
      }

      // Get underlying token address from mapping
      const chainTokenMapping = tokenAddresses[vault.chainId] || {};
      const underlyingToken = chainTokenMapping[token.name];

      pools.push({
        pool: poolAddress,
        chain: getChainNameById(vault.chainId),
        project: 'bolide',
        symbol: token.name,
        tvlUsd: token.tvl,
        apy: vault.baseApy,
        underlyingTokens: underlyingToken ? [underlyingToken] : undefined,
      });
    }
  }

  return pools.filter((p) => p.chain);
};

const getChainNameById = (chainId) => {
  switch (chainId) {
    case 1:
      return 'ethereum';
    case 56:
      return 'binance';
    case 137:
      return 'polygon';
  }
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.bolide.fi/#/',
};
