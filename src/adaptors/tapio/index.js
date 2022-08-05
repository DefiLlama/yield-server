const utils = require('../utils');

const getPools = async () => {
  const tdotApr = await utils.getData(
    'https://api.taigaprotocol.io/rewards/apr?network=acala&pool=0'
  );
  const tdotStats = await utils.getData(
    'https://api.taigaprotocol.io/tokens/tdot/stats'
  );

  const tdot = {
    pool: 'acala-sa0-tapio',
    chain: 'acala',
    project: 'tapio-protocol',
    symbol: 'tDOT',
    tvlUsd: tdotStats.data.tvl,
    apyBase: Number(tdotApr['sa://0']) * 100,
  };

  return [tdot];
};

module.exports = {
  timetravel: false,
  apy: getPools,
};
