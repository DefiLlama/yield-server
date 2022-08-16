const utils = require('../utils');
const axios = require('axios').default;

const poolsFunction = async () => {
  const res = await axios.get('https://api.ponyfinance.xyz/info');

  const { apy, tvl } = res.data;

  const ponyPool = {
    pool: '0x0d97fee619d955509e54b046c9992b6e9f5b0630',
    chain: utils.formatChain('ethereum'),
    project: 'pony-finance',
    symbol: 'PONY',
    tvlUsd: Number(tvl),
    apyBase: Number(apy),
  };

  return [ponyPool];
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
};
