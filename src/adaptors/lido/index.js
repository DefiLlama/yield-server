const utils = require('../utils');

const buildPool = (entry, chainString) => {
  const newObj = {
    pool: `lido-${entry.token}`,
    chain: utils.formatChain(chainString),
    project: 'lido',
    symbol: utils.formatSymbol(entry.token),
    tvlUsd:
      chainString === 'ethereum' ? entry.marketCap : entry.totalStaked.usd,
    apy: entry.apr,
  };

  return newObj;
};

const topLvl = async (chainString, url, token) => {
  if (chainString === 'ethereum') {
    dataTvl = await utils.getData(`${url}/short-lido-stats`);
    dataApy = await utils.getData(`${url}/steth-apr`);
    dataTvl.apr = dataApy;
    data = { ...dataTvl };
  } else {
    data = await utils.getData(url);
  }
  data.token = token;

  data = buildPool(data, chainString);

  return data;
};

const main = async () => {
  const data = await Promise.all([
    topLvl('ethereum', 'https://stake.lido.fi/api', 'stETH'),
    topLvl('polygon', 'https://polygon.lido.fi/api/stats', 'stMATIC'),
    topLvl('solana', 'https://solana.lido.fi/api/stats', 'stSOL'),
    topLvl('kusama', 'https://kusama.lido.fi/api/stats', 'stKSM'),
  ]);
  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
};
