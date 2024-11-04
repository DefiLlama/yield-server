const utils = require('../utils');
const axios = require('axios');

const API_URL = 'https://api.loopring.network/api/v2/amm/poolsStats';

const getApy = async () => {
  const poolsData = (await axios.get(API_URL)).data;

  const pools = poolsData.data.map((pool) => ({
    pool: `${pool.market}-loopring`,
    chain: utils.formatChain('ethereum'),
    project: 'loopring',
    symbol: pool.market.replace('AMM-', ''),
    tvlUsd: Number(pool.liquidityUSD),
    apy: Number(pool.apyBips) / 100,
  }));

  return pools;
};

module.exports = {
  timetravel: false,
  apy: getApy,
  url: 'https://loopring.io/#/markets',
};
