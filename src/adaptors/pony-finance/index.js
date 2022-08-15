const utils = require('../utils');

const poolsFunction = async () => {
  const res = await fetch('https://api.ponyfinance.xyz/info');

  const { apy, tvl } = await res.json();

  const ponyPool = {
    pool: '0x0d97fee619d955509e54b046c9992b6e9f5b0630',
    chain: utils.formatChain('ethereum'),
    project: 'pony-finance',
    symbol: 'PONY',
    tvlUsd: Number(tvl),
    apyBase: Number(apy),
  };

  return [ponyPool]
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
