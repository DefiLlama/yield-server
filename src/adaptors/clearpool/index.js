const utils = require('../utils');

const poolsFunction = async () => {
  const networks = {
    1: 'Ethereum',
    137: 'Polygon',
  };
  const rewardTokens = {
    1: '0x66761fa41377003622aee3c7675fc7b5c1c2fac5',
    137: '0x0000000000000000000000000000000000001010',
  };
  const underlyingTokens = {
    1: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',
    137: '0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174',
  };

  const dataPools = await utils.getData(
    'https://clearpool.finance/api/top-pools'
  );

  let pools = [];
  const allpools = Object.keys(dataPools).map((chainId) => {
    dataPools[chainId].map((pool) => {
      const chainName = utils.formatChain(networks[chainId]);
      pools.push({
        pool: `${pool.address}-${chainName}`.toLowerCase(),
        chain: chainName,
        project: 'clearpool',
        symbol: pool.asset,
        tvlUsd: pool.poolSize - pool.utilization,
        apyBase: pool.supplyAPR,
        apyReward: pool.cpoolAPR, // APY from pool LM rewards in % // CPOOL APR
        rewardTokens: [rewardTokens[chainId]], // !!! // CPOOL token address // Array of reward token addresses (you can omit this field if a pool doesn't have rewards)
        underlyingTokens: [underlyingTokens[chainId]], // Array of underlying token addresses from a pool, eg here USDC address on ethereum
        poolMeta: pool.borrower.name, // A string value which can stand for any specific details of a pool position, market, fee tier, lock duration, specific strategy etc
        totalSupplyUsd: pool.poolSize,
        totalBorrowUsd: pool.utilization,
        apyBaseBorrow: pool.borrowAPR,
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
