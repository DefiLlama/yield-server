const utils = require('../utils');

const buildPool = (entry, chainString) => {
  const newObj = {
    pool: `lido-${entry.token}`,
    chain: utils.formatChain(chainString),
    project: 'lido',
    symbol: utils.formatSymbol(entry.token),
    tvlUsd:
      chainString === 'ethereum' ? entry.marketCap : entry.totalStaked.usd,
    apy: Number(entry.apr),
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

  // apy values from https://solana.lido.fi/api/stats for solana are incorrect
  // using other endpoint instead. for more details see https://github.com/DefiLlama/yield-server/issues/6
  if (chainString === 'solana') {
    apy = await utils.getData('https://solana.lido.fi/api/apy/apy?days=14');
    data.apr = apy.annual_percentage_yield;
  }

  data = buildPool(data, chainString);

  return data;
};

const main = async () => {
  const data = [];
  // for some reason Promise.all often crashes here, so awaiting each individually
  const ethereum = await topLvl(
    'ethereum',
    'https://stake.lido.fi/api',
    'stETH'
  );
  const polygon = await topLvl(
    'polygon',
    'https://polygon.lido.fi/api/stats',
    'stMATIC'
  );
  const solana = await topLvl(
    'solana',
    'https://solana.lido.fi/api/stats',
    'stSOL'
  );
  const kusama = await topLvl(
    'kusama',
    'https://kusama.lido.fi/api/stats',
    'stKSM'
  );
  data.push(ethereum, polygon, solana, kusama);
  return data.flat();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://lido.fi/#networks',
};
