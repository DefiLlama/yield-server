const axios = require('axios');

const main = async () => {
  const res = (await axios.get('https://www.avault.network/api/v0/yield/info'))
    .data.data;
  return res;
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://www.avault.network/vault',
};
