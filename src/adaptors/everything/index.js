const utils = require('../utils');

const url = 'https://app.everything.inc/liquidity';

const apy = async () => {
  const data = await utils.getData(
    'https://prod-everything-yields.s3.eu-central-1.amazonaws.com/yields/latest.json'
  );
  return data.pools;
};

module.exports = {
  timetravel: false,
  apy,
  url,
};
