const cauldrons = require('./cauldrons');
const multiRewardFarms = require('./multi-reward-farms');
const farms = require('./farms');
const magicGlp = require('./magic-glp');
const utils = require('../utils');

const getApy = async () => {
  const pools = [
    ...(await cauldrons()),
    ...(await farms()),
    ...(await magicGlp()),
    ...(await multiRewardFarms()),
  ].map((i) => ({ ...i, pool: i.pool.toLowerCase() }));

  return utils.removeDuplicates(pools);
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.abracadabra.money',
};
