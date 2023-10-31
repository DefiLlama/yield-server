const cauldrons = require('./cauldrons');
const farms = require('./farms');
const magicGlp = require('./magic-glp');

const getApy = async () => [
  ...(await cauldrons()),
  ...(await farms()),
  ...(await magicGlp()),
];

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.abracadabra.money',
};
