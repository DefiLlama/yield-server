const axios = require('axios');

const BASE_URL = 'https://api.interport.fi/defilama/yield';
const STABLECOIN_URL = 'https://app.interport.fi/stablecoin-pools';

const CHAINS = {
  1: 'Ethereum',
  250: 'Fantom Opera',
};

const getData = async () => {
  const { data } = await axios.get(BASE_URL);
  return data.map((item) => {
    return { ...item, chain: CHAINS[item.chain] };
  })
};

module.exports = {
  apy: getData,
  url: STABLECOIN_URL
};