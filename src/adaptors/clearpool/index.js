const utils = require('../utils');

const poolsFunction = async () => {
  const networks = {
    1: 'Ethereum',
    137: 'Polygon',
  };
  const rewardTokens = {
    1: '0x66761fa41377003622aee3c7675fc7b5c1c2fac5',
    137: '0xb08b3603C5F2629eF83510E6049eDEeFdc3A2D91',
  };
  const underlyingTokens = {
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    137: '0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0',
  };

  const dataPools = await utils.getData(
    'https://app.clearpool.finance/api/pools'
  );

  let pools = [];
  const allpools = Object.keys(dataPools).map((chainId) => {
    dataPools[chainId].map((pool) => {
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
        underlyingTokens: [underlyingTokens[chainId]], // Array of underlying token addresses from a pool, eg here USDC address on ethereum
        poolMeta: `${pool.borrowerName}`, // A string value which can stand for any specific details of a pool position, market, fee tier, lock duration, specific strategy etc
        totalSupplyUsd: pool.poolSize,
        totalBorrowUsd: pool.utilization,
        ltv: 0, //permissioned
      });
    });
  });

  return pools.filter((p) => utils.keepFinite(p));
};
module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://clearpool.finance/',
};
