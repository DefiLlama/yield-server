const axios = require('axios');

const apyDataUrl =
  'https://mainnet-api.monday.trade/spot/api/defi/llama/spot/yield/stats/143';

const apy = async () => {
  const response = await axios.get(apyDataUrl);
  const pools = response.data;
  pools.forEach((pool) => {
    pool.project='monday-trade';
  })
  return pools
    .filter((i) => i.tvlUsd >= 1e4)
    .sort((a, b) => b.tvlUsd - a.tvlUsd);
};

module.exports = {
  apy,
};
