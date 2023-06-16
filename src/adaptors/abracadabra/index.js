const cauldrons = require('./cauldrons');
const farms = require('./farms');

const getApy = async () => [...(await cauldrons()), ...(await farms())];

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://app.abracadabra.money',
};
