const utils = require('../utils');

const addresses = {
  staking: '0x382c70620e42c2EF2b303b97bad1d9439Bf48ef9',
};

const poolsFunction = async () => {
  const res = await fetch('https://sensay.io/api/snsy');
  const info = await res.json();
  const pools = info.pools;

  let poolData = []
  for (const pool of pools) {
    poolData.push({
      pool: '0x382c70620e42c2EF2b303b97bad1d9439Bf48ef9-ethereum',
      chain: utils.formatChain('ethereum'),
      project: 'sensay',
      symbol: 'SNSY',
      tvlUsd: pool.totalDeposit,
      apy: pool.apy,
    });
  }

  return poolData;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.snsy.ai',
};