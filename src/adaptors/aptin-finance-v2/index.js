const utils = require('../utils');
 
async function main() {
    const apyData = await utils.getData(
        'https://data.aptin.io/api/data'
      ); 
      return apyData
}
 

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://app.aptin.io',
};
