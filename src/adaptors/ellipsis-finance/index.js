const sdk = require('@defillama/sdk');
const utils = require('../utils');

const CHAIN = 'bsc';

// Curve-style ABI for getting pool coins
const poolAbi = {
  coins: {
    inputs: [{ internalType: 'uint256', name: '', type: 'uint256' }],
    name: 'coins',
    outputs: [{ internalType: 'address', name: '', type: 'address' }],
    stateMutability: 'view',
    type: 'function',
  },
};

// Fetch underlying tokens from pool contract using coins(i)
const getPoolCoins = async (poolAddress) => {
  const coins = [];
  // Try to get up to 4 coins (most Curve pools have 2-4)
  for (let i = 0; i < 4; i++) {
    try {
      const result = await sdk.api.abi.call({
        target: poolAddress,
        abi: poolAbi.coins,
        params: [i],
        chain: CHAIN,
      });
      if (result.output && result.output !== '0x0000000000000000000000000000000000000000') {
        coins.push(result.output);
      }
    } catch (e) {
      // No more coins at this index
      break;
    }
  }
  return coins.length > 0 ? coins : undefined;
};

const poolsFunction = async () => {
  const get = await utils.getData('https://api.ellipsis.finance/api/getAPRs');
  const dataAPRs = get.data;

  // Filter pools with TVL > 0
  const activePools = Object.values(dataAPRs).filter(obj => parseInt(obj.tvl) > 0);

  // Fetch underlying tokens for all pools in parallel
  const poolsWithTokens = await Promise.all(
    activePools.map(async (obj) => {
      const underlyingTokens = await getPoolCoins(obj.address);
      return {
        pool: obj.address,
        chain: utils.formatChain('binance'),
        project: 'ellipsis-finance',
        symbol: obj.assets,
        tvlUsd: parseFloat(obj.tvl),
        apy: parseFloat(obj.totalApr),
        url: `https://ellipsis.finance/pool/${obj.address}`,
        underlyingTokens,
      };
    })
  );

  return poolsWithTokens;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
