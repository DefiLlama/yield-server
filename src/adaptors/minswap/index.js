const axios = require('axios');

const API_URL = 'https://api-mainnet-prod.minswap.org/defillama/yield-server';

const apy = async () => {
  const data = (await axios.get(API_URL)).data;
  return data.map((d) => {
    return {
      pool: `${d.pool}-cardano`,
      chain: "Cardano",
      project: "minswap",
      symbol: d.symbol,
      tvlUsd: d.tvlUsd,
      apyBase: d.apyBase,
      apyReward: d.apyReward,
      rewardTokens: d.rewardTokens,
    };
  });
};

module.exports = {
  timetravel: false,
  apy: apy,
  url: 'https://app.minswap.org/farm',
};
