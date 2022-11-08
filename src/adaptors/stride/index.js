const main = async () => {
  const data = await utils.getData(
    'https://api-osmosis.imperator.co/pools/v2/all?low_liquidity=false'
  );

  const pools = []

  for (const entry of data) {
    for (const duration of [1, 7, 14]) {
      pool.push(      {
        pool: `${entry.pool}-STRD`,
        chain: utils.formatChain('Stride'),
        project: 'stride',
        symbol: utils.formatSymbol(entry.denom),
        poolMeta: duration,
        tvlUsd: entry.tvl,
        apy: entry.apr_gauge[duration],
      })
    }
  }

  return pools.filter((pool) => {
    return utils.keepFinite(pool)
  });
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.stride.zone/pools',
};
