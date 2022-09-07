const utils = require('../utils');

const collectPools = async () => {
  const data = await utils.getData('https://api.penrose.money/pools');

  return data
    .map((pool) => {
      const name = pool.poolData.symbol.split('-');
      return {
        pool: pool.id,
        chain: utils.formatChain('polygon'),
        project: 'penrose',
        symbol: utils.formatSymbol(name[1]),
        poolMeta: name[0],
        tvlUsd: Number(pool.totalTvlUsd),
        apy: utils.aprToApy(Number(pool.totalApr)),
      };
    })
    .filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: collectPools,
  url: 'https://app.penrose.money/dashboard/earn/stake',
};
