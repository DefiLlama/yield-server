const utils = require('../utils');

const main = async () => {
  const data = await utils.getData('https://app.stride.zone/api/pool-gauges');

  const pools = [];

  for (const entry of data) {
    pools.push({
      pool: `${entry.poolId}-${entry.gaugeId}-${entry.token}`,
      chain: utils.formatChain('Stride'),
      project: 'stride',
      symbol: utils.formatSymbol(entry.token),
      poolMeta: `${entry.lockupDuration} day(s)`,
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
  url: 'https://app.stride.zone',
}; // npm run test --adapter=stride
