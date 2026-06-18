const { getData } = require('../utils');

const convertToMap = (arr, key) => {
  const res = {};
  for (const item of arr) {
    res[`${item[`${key}`]}`] = item;
  }
  return res;
};

const apy = async () => {
  const aprData = convertToMap(
    await getData('https://ply-indexer.mainnet.plenty.network/v1/pools'),
    'pool'
  );
  const analyticsData = convertToMap(
    await getData('https://api.analytics.plenty.network/analytics/pools'),
    'pool'
  );

  const pools = [];
  Object.keys(aprData).forEach((pool) => {
    pools.push({
      pool: `${pool}-tezos`,
      chain: 'Tezos',
      project: 'plenty',
      symbol: analyticsData[pool].symbol.replace('/', '-'),
      tvlUsd: parseFloat(analyticsData[pool].tvl.value),
      apyReward: parseFloat(aprData[pool].apr), // no compounding available
      rewardTokens: ['KT1JVjgXPMMSaa6FkzeJcgb8q9cUaLmwaJUX'],
      poolMeta:
        analyticsData[pool].type === 'STABLE'
          ? 'Delta neutral yield'
          : undefined,
    });
  });

  return pools;
};

module.exports = {
  protocolId: '490',
  timetravel: false,
  apy: apy,
  url: 'https://app.plenty.network/pools',
};
