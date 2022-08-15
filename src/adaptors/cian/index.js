const axios = require('axios');

const apiUrl = 'https://data.cian.app/api/v1/staking_avax/apr';

async function fetch() {
  const response = (await axios.get(apiUrl)).data.data;
  return response;
}

const main = async () => {
  const data = fetch();
  return data;
};

module.exports = {
  timetravel: false,
  apy: main,
};
