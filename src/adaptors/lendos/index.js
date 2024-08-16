const utils = require('../utils');

const poolsFunction = async () => {
  return (
    await utils.getData('https://app.lendos.org/api/v1/referral/rewards/apy')
  ).map((i) => {
    const { poolMeta, ...rest } = i;
    return rest;
  });
};

module.exports = {
  apy: poolsFunction,
};
