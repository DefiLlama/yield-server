const axios = require('axios');

const apyDataUrl =
  'https://mainnet-api.monday.trade/spot/api/defi/llama/spot/yield/stats/143';

const apy = async () => {
  const response = await axios.get(apyDataUrl);
  return response.data.sort((a, b) => b.tvlUsd - a.tvlUsd);
};

module.exports = {
  apy,
};
