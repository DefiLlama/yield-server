const { fetchURL } = require('../../helper/utils');

const convertToMap = (arr, key) => {
  const res = {};
  for (const item of arr) {
    res[`${item[`${key}`]}`] = item;
  }
  return res;
};

const apy = async () => {
  const aprData = convertToMap(
    (await fetchURL('https://ply-indexer.mainnet.plenty.network/v1/pools'))
      .data,
    'pool'
  );
  const analyticsData = convertToMap(
    (await fetchURL('https://api.analytics.plenty.network/analytics/pools'))
      .data,
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
  timetravel: false,
  apy: apy,
  url: 'https://app.plenty.network/pools',
};
