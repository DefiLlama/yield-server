const axios = require('axios');
const utils = require('../utils');

function aggregateApys(aprs, key, locking) {
  const stakingApys = aprs.Staking[key].total;
  if (locking) {
    const lockingApys = aprs.Locking[key].total;
    return stakingApys + lockingApys;
  } else {
    return stakingApys;
  }
}

async function apy() {
  const [{ data: aprs }, { data: tvls }, { data: prices }] = await Promise.all([
    axios.get(`https://api.vectorfinance.io/api/v1/vtx/apr`),
    axios.get(`https://api.vectorfinance.io/api/v1/vtx/tvl`),
    axios.get(`https://api.vectorfinance.io/api/v1/vtx/marketPrices`),
  ]);

  const lockingLength = Object.entries(aprs.Locking).length;

  return [...Object.entries(aprs.Locking), ...Object.entries(aprs.Staking)].map(
    ([k, v], i) => ({
      pool: `vector-${k}-${i < lockingLength ? 'locking' : 'staking'}`,
      chain: 'Avalanche',
      project: 'vector-finance',
      symbol: utils.formatSymbol(k.replace(/_/g, '-')),
      tvlUsd:
        Number(tvls[i < lockingLength ? 'Locking' : 'Staking'][k]) * prices[k],
      apy: aggregateApys(aprs, k, i < lockingLength),
    })
  );
}

const main = async () => {
  return await apy();
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://vectorfinance.io/stake',
};
