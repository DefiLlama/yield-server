const data = require('../rhea-lend/data');
const { getPools } = require('./pools');

const apy = () => getPools(data);

module.exports = { protocolId: '541', timetravel: false, apy };
