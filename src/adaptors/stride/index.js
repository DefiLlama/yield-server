const utils = require('../utils');

const main = async () => {
  const data = await utils.getData('http://localhost:3000/api/pool-gauges');

  const pools = [];

  for (const entry of data) {
    pools.push({
      pool: `${entry.poolId}-${entry.duration}-${entry.token}`,
      chain: utils.formatChain('Stride'),
      project: 'stride',
      symbol: utils.formatSymbol(entry.token),
      poolMeta: `${entry.duration} day(s)`,
      tvlUsd: entry.tvl,
      apy: entry.apr,
    });
  }

  return pools.filter((pool) => {
    return utils.keepFinite(pool);
  });
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.stride.zone/pools',
}; // npm run test --adapter=stride
