const multiRewardFarms = require('./multi-reward-farms');
const farms = require('./farms');
const utils = require('../utils');

const getApy = async () => {
  const pools = [
    ...(await farms()),
    ...(await multiRewardFarms()),
  ].map((i) => ({ ...i, pool: i.pool.toLowerCase() }));

  return utils.removeDuplicates(pools);
};

module.exports = {
  protocolId: '347',
  timetravel: false,
  apy: getApy,
  url: 'https://app.abracadabra.money',
};
