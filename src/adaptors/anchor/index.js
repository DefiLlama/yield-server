const utils = require('../utils');

const buildPool = (entry, chainString) => {
  const newObj = {
    pool: 'terra1hzh9vpxhsk8253se0vv5jj6etdvxu3nv8z07zu',
    chain: utils.formatChain(chainString),
    project: 'anchor',
    symbol: utils.formatSymbol('UST'),
    tvlUsd: Number(entry.tvl) / 1e6,
    apy: entry.deposit_apy * 100,
  };

  return newObj;
};

const topLvl = async (chainString) => {
  let data = await utils.getData(
    'https://api.anchorprotocol.com/api/v1/market/ust'
  );
  const dataTvl = await utils.getData(
    'https://api.anchorprotocol.com/api/v1/deposit'
  );
  data.tvl = dataTvl.total_ust_deposits;

  data = [data].map((el) => buildPool(el, chainString));

  return data;
};

const main = async () => {
  const data = await topLvl('terra');
  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
};
