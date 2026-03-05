const utils = require('../utils');

const API_URL = 'https://2jbbf-vqaaa-aaaam-ab5fa-cai.raw.icp0.io/pool-list';

const getApy = async () => {
  const pools = await utils.getData(API_URL);
  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://icpex.org',
};
