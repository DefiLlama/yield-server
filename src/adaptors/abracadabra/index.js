const cauldrons = require('./cauldrons');
const multiRewardFarms = require('./multi-reward-farms');
const farms = require('./farms');
const magicGlp = require('./magic-glp');

const getApy = async () =>
  [
    ...(await cauldrons()),
    ...(await farms()),
    ...(await magicGlp()),
    ...(await multiRewardFarms()),
  ].map((i) => ({ ...i, pool: i.pool.toLowerCase() }));

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.abracadabra.money',
};
