const data = require('./data');
const { getPools } = require('./pools');

async function apy() {
  return getPools(data);
}

module.exports = { protocolId: '1546', timetravel: false, apy };
