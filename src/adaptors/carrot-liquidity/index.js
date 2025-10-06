const axios = require('axios');
const utils = require('../utils');

const CRT_POOL = 'FfCRL34rkJiMiX5emNDrYp3MdWH2mES3FvDQyFppqgpJ';

const getApy = async () => {
  const performanceData = (await axios.get(`https://api.deficarrot.com/performance?vault=${CRT_POOL}&useCache=true`)).data;

  const metricsData = (await axios.get(
    `https://api.deficarrot.com/vault?vault=${CRT_POOL}&useCache=true`
  )).data;

  const crtPool = {
    pool: CRT_POOL,
    chain: 'Solana',
    project: 'carrot-liquidity',
    symbol: utils.formatSymbol('USDC-USDT-PYUSD'),
    underlyingTokens: metricsData.assets.map(asset => asset.mint),
    tvlUsd: Number(metricsData.tvl),
    apyBase: Number(performanceData.navAPY[0].apy),
  };

  return [crtPool];
};

module.exports = {
    apy: getApy,
    url: 'https://use.deficarrot.com/',
};


// we also have the historical data for the APY if it can be used that would be great
// https://api.deficarrot.com//historicalVaultApy?vault=FfCRL34rkJiMiX5emNDrYp3MdWH2mES3FvDQyFppqgpJ&interval=DAY

