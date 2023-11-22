// pnpm i -f
// pnpm i jest -g
// npm run test --adapter=clearpool

const utils = require('../utils');

const poolsFunction = async () => {
  const networks = {
    1: 'Ethereum',
    10: 'Optimism',
    137: 'Polygon',
    1101: 'Polygon zkEVM',
  };
  /** CPOOL token address for each chain */
  const rewardTokens = {
    1: '0x66761fa41377003622aee3c7675fc7b5c1c2fac5',
    10: '0xc3630b805F10E91c2de084Ac26C66bCD91F3D3fE',
    137: '0xb08b3603C5F2629eF83510E6049eDEeFdc3A2D91',
    1101: '0xc3630b805F10E91c2de084Ac26C66bCD91F3D3fE',
  };
  /** USDC token address for each chain */
  const underlyingTokensUSDC = {
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    10: '0x0b2C639c533813f4Aa9D7837CAf62653d097Ff85',
    137: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
    1101: '0xA8CE8aee21bC2A48a5EF670afCc9274C7bbbC035',
  };
  /** USDT token address for each chain */
  const underlyingTokensUSDT = {
    1: '0xdAC17F958D2ee523a2206206994597C13D831ec7',
    10: '0x94b008aA00579c1307B0EF2c499aD98a8ce58e58',
    137: '0xc2132D05D31c914a87C6611C10748AEb04B58e8F',
    1101: '0x1E4a5963aBFD975d8c9021ce480b42188849D41d',
  };
  const dataPools = await utils.getData('https://clearpool.finance/api/pools');
  let pools = [];

  for (const chainId in dataPools) {
    for (const pool of dataPools[chainId]) {
      const chainName = utils.formatChain(networks[chainId]);

      pools.push({
        pool: `${pool.address}-${chainName}`.toLowerCase(),
        chain: chainName,
        project: 'clearpool',
        symbol: pool.currencyName,
        tvlUsd: pool.poolSize - pool.utilization,
        apyBase: pool.supplyAPR,
        apyReward: pool.cpoolAPR, // APY from pool LM rewards in % // CPOOL APR
        rewardTokens: [rewardTokens[chainId]], // !!! // CPOOL token address // Array of reward token addresses (you can omit this field if a pool doesn't have rewards)
        underlyingTokens: [
          underlyingTokensUSDC[chainId],
          underlyingTokensUSDT[chainId],
        ], // Array of underlying token addresses from a pool, eg here USDC address on ethereum
        poolMeta: `${pool.currencyName} (${pool.borrowerName})`, // A string value which can stand for any specific details of a pool position, market, fee tier, lock duration, specific strategy etc
      });
    }
  }

  return pools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://clearpool.finance/',
};
