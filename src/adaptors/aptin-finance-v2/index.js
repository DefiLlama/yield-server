const utils = require('../utils');
 
async function main() {
    const apyData = await utils.getData(
        'https://data.aptin.io/api/data'
      ); 
      return apyData
}
 

module.exports = {
  protocolId: '3705',
    timetravel: false,
    apy: main,
    url: 'https://app.aptin.io',
};
