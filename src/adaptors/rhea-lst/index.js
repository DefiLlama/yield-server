const { getPools } = require('./pools');

async function apy() {
  return getPools();
}

module.exports = { protocolId: '6985', timetravel: false, apy };
