const utils = require('../utils');

const buildPool = (entry, chainString) => {
  const newObj = {
    pool: entry.vaultToken,
    chain: utils.formatChain(chainString),
    project: 'badger-dao',
    symbol: utils.formatSymbol(entry.name),
    tvlUsd: entry.value,
    apy: entry.apr,
  };

  return newObj;
};

const topLvl = async (chainString) => {
  // pull data
  const s = chainString === 'binance' ? 'bsc' : chainString;
  const url = `https://api.badger.com/v2/vaults?chain=${s}&currency=usd`;
  let data = await utils.getData(url);

  // build pool objects
  data = data.map((el) => buildPool(el, chainString));

  return data;
};

const main = async () => {
  const data = await Promise.all([
    topLvl('ethereum'),
    topLvl('polygon'),
    topLvl('arbitrum'),
    topLvl('fantom'),
    // topLvl('binance'),
  ]);
  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.badger.com',
};
