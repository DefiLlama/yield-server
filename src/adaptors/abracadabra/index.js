const cauldrons = require('./cauldrons');
const farms = require('./farms');

const getApy = async () =>
  [...(await cauldrons()), ...(await farms())].map((p) => ({ ...p, apy: 0 }));

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.abracadabra.money',
};
