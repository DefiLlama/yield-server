const utils = require('../utils');

const getPoolSymbol = (entry) => {
  // stATOM/ATOM -> stATOM-ATOM
  return entry.poolName.split('/').join('-');
};

const main = async () => {
  const data = await utils.getData('https://app.stride.zone/api/pool-gauges');

  const pools = [];
  let uniqueIds = [];
  for (const entry of data) {
    if (!entry.poolId) continue;
    if (uniqueIds.includes(entry.poolId)) continue;
    uniqueIds.push(entry.poolId);
    const symbol = getPoolSymbol(entry);

    pools.push({
      pool: `${entry.poolId}-${entry.gaugeId}-${entry.token}`,
      chain: utils.formatChain('Stride'),
      project: 'stride',
      symbol: utils.formatSymbol(symbol),
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
