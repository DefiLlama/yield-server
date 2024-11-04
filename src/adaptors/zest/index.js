const utils = require('../utils');

const poolsFunction = async () => {
  const poolsData = await utils.getData(
    'https://vbagz9fywg.execute-api.us-east-2.amazonaws.com/prod/pools'
  );
  return poolsData;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.zestprotocol.com/assets',
};