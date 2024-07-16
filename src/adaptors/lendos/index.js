const utils = require('../utils');

const poolsFunction = async () => {
    return await utils.getData(
        'https://app.lendos.org/api/v1/referral/rewards/apy'
    );
};

module.exports = {
    apy: poolsFunction,
};
