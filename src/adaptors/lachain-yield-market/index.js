const utils = require('../utils');

const url = 'https://farms-info.lachain.io/farms/ladex';


const apy = (dataLadex) => {
  const data = [];

  for(const pool of dataLadex){
    data.push({
        pool: pool.id,
        chain: 'lachain',
        project: 'lachain-yield-market',
        symbol: pool.name,
        tvlUsd: parseFloat(pool.tvl),
        apy: parseFloat(pool.apy)*100
    });
  }
  return data;
};

const main = async () => {
  // pull data
  const dataLadex = await utils.getData(url);
  // calculate apy
  let data = apy(dataLadex);
  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://lachain.io/app/yield-market',
};
