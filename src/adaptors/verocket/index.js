const axios = require('axios');
const utils = require('../utils');

const baseUrl = 'https://api-v1.verocket.com';
const urlApy = `${baseUrl}/apy`;
const tvlApy = `${baseUrl}/dex/overall/lp_volume`;
const vetPrice = `${baseUrl}/price/vet`;

const getVetPrice = async () => {
  return (await axios.get(vetPrice)).data.data.usd;
};

const apy = async () => {
  const response = (await axios.get(urlApy)).data.data;

  // create a custom object with pool address as the key
  var apyObject = {};
  response.forEach((el) => {
    apyObject[el.pool] = el;
    apyObject[el.pool].apy_status = el.apy_status[1].apy;
  });

  return apyObject;
};

const tvl = async (data) => {
  const response = (await axios.get(tvlApy)).data.data;

  // get vet price
  const vetPrice = await getVetPrice();

  // fetch latest TVL from the list of 30 days TVL
  tvlObjects = response[response.length - 1].items;

  // append TVL data to APY object by identifying using pool key
  tvlObjects.forEach((el) => {
    data[el.pool].tvl_vet = el.eq_vet;
    data[el.pool].tvl_usd = el.eq_vet * vetPrice;
  });

  return data;
};

function buildPool(entry) {
  const newObj = {
    pool: entry[1].pool,
    chain: utils.formatChain('vechain'),
    project: 'verocket',
    symbol: utils.formatSymbol(
      `${entry[1].token0.toUpperCase()}-${entry[1].token1.toUpperCase()}`
    ),
    tvlUsd: Number(entry[1].tvl_usd),
    apy: entry[1].apy_status * 100,
  };

  return newObj;
}

const main = async () => {
  // pull apy data
  data = await apy();

  // pull tvl data and merge it with apy data object
  data = await tvl(data);

  // build pool objects
  data = Object.entries(data).map((entry) => buildPool(entry));

  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://app.verocket.com/',
};
