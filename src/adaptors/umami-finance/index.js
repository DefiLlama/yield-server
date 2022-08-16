const axios = require('axios');

const mUMAMI_ADDRESS = '0x2adabd6e8ce3e82f52d9998a7f64a90d294a92a4';
const cmUMAMI_ADDRESS = '0x1922c36f3bc762ca300b4a46bb2102f84b1684ab';

const main = async () => {
  const {
    data: { marinate, mUmamiCompounder },
  } = await axios.get('https://api.umami.finance/api/v1/marinate');

  const mUMAMI = {
    pool: mUMAMI_ADDRESS,
    tvlUsd: +marinate.marinateTVL,
    apy: +marinate.apr,
    symbol: 'UMAMI',
  };

  const cmUMAMI = {
    pool: cmUMAMI_ADDRESS,
    tvlUsd: +mUmamiCompounder.tvl,
    apy: +marinate.apy,
    symbol: 'mUMAMI',
  };

  return [mUMAMI, cmUMAMI].map((strat) => ({
    ...strat,
    chain: 'Arbitrum',
    project: 'umami-finance',
  }));
};

module.exports = {
  timetravel: false,
  apy: main,
};
