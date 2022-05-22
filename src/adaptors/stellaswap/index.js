const utils = require('../utils');

const buildPool = (entry) => {
  const newObj = {
    pool: entry.id,
    chain: utils.formatChain(entry.chain),
    project: 'stellaswap',
    symbol: entry.tokens,
    tvlUsd: entry.tvl,
    apy: ( entry.reward + entry.base ) * 100,
  };

  return newObj;
};

const farmsList = async () => {
  let data = await utils.getData(
    'https://api.stellaswap.com/api/v1/coindix'
  );

  const nonActivefarms = data.result.filter(f => f.active);
  data = nonActivefarms.map((el) => buildPool(el));

  return data;
};

const main = async () => {
  const data = await farmsList();
  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
};
