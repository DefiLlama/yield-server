const utils = require('../utils');

const API_URL =
  'https://yusan.fi/defillama_pools';

const getApy = async () => {
  const pools = await utils.getData(API_URL);
  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://yusan.fi',
};
