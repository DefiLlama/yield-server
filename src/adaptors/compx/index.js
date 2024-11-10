const axios = require('axios');

const poolsFunction = async () => {
  const { data: pools } = await axios.get(
    "https://api-general.compx.io/api/defi-llama/staking-pools-v2"
  );

  return pools;
};

module.exports = {
  timetravel: false,
  apy: poolsFunction,
  url: 'https://app.compx.io/staking-pools',
};