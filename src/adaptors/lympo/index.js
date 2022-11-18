const utils = require('../utils');

const apiUrl = 'https://vywp1l5s3b.execute-api.eu-central-1.amazonaws.com/default/defillamaApi';

const main = async () => {
    let data = await utils.getData(apiUrl);

    return data.flat();
};

module.exports = {
    timetravel: false,
    apy: main,
    url: 'https://lympo.io',
};
