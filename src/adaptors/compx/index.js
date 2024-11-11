const axios = require('axios');

const poolsFunction = async () => {
  const pools = await axios.get(
    'https://api-general.compx.io/api/defillama/yield-farms'
  );

  return pools.data;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.compx.io/farms',
};