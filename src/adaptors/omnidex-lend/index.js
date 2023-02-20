const superagent = require('superagent');
const utils = require('../utils');
const sdk = require('@defillama/sdk');

const url = 'https://omnidex.bmaa3ajd1gjri.eu-west-2.cs.amazonlightsail.com/yields';

const topLvl = async (url) => {
    const dataTvl = await utils.getData(url);
    var data = Object.keys(dataTvl).map(function (k) { return dataTvl[k] });
    return data
};

const main = async () => {
    const data = await Promise.all([topLvl(url)]);
    return data.flat();
};

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://lending.omnidex.finance/markets',
};
