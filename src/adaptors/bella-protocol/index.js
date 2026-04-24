const utils = require('../utils');
const { getApy } = require('./apy');

// Mapping of vault addresses to underlying token addresses
const VAULT_TO_UNDERLYING = {
  '0x2c23276107b45e64c8c59482f4a24f4f2e568ea6': '0xdac17f958d2ee523a2206206994597c13d831ec7', // bUSDT -> USDT
  '0x8016907d54ed8bcf5da100c4d0eb434c0185dc0e': '0xa0b86991c6218b36c1d19d4a2e9eb0ce3606eb48', // bUSDC -> USDC
  '0x750d30a8259e63ed72a075f5b6630f08ce7996d0': '0xba50933c268f567bdc86e1ac131be072c6b0b71a', // bARPA -> ARPA
  '0x3fb6b07d77dace1ba6b5f6ab1d8668643d15a2cc': '0x2260fac5e5542a773aa44fbcfedf7c193bc2c599', // bWBTC -> WBTC
  '0x8d9a39706d3b66446a298f1ae735730257ec6108': '0x0316EB71485b0Ab14103307bf65a021042c6d380', // bHBTC -> HBTC
};

const buildPool =
  (chain) =>
  ([name, { strategyApy, distributionApy, tvlUsd, pool }]) => {
    const underlyingToken = VAULT_TO_UNDERLYING[pool.toLowerCase()];
    return {
      pool: [pool, chain].join('-'),
      chain: utils.formatChain(chain),
      project: 'bella-protocol',
      symbol: utils.formatSymbol(name.toUpperCase()),
      rewardTokens: ['0xcA7aE36A38eA4dE50DFEeCF6A4c44fC074811a6c'],
      apyBase: strategyApy,
      apyReward: distributionApy,
      tvlUsd,
      underlyingTokens: underlyingToken ? [underlyingToken] : undefined,
      url: `https://fs.bella.fi/#/flex-savings/${name.toUpperCase()}`,
    };
  };

const main = async () => {
  const apy = await getApy();
  return Object.entries(apy).map(buildPool('ethereum'));
};

module.exports = {
  timetravel: false,
  apy: main,
};
