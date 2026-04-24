const axios = require('axios');
const utils = require('../utils');

// Token addresses on Avalanche
const tokenAddresses = {
  VTX: '0x5817D4F0b62A59b17f75207DA1848C2cE75e7AF4',
  PTP: '0x22d4002028f537599bE9f666d1c4Fa138522f9c8',
  xPTP: '0x060556209E507d30f2167a101bFC6D256Ed2f3e1',
  zJOE: '0x769bfeb9fAacD6Eb2746979a8dD0b7e9920aC2A4',
  JOE: '0x6e84a6216eA6dACC71eE8E6b0a5B7322EEbC0fDd',
  xQI: '0x0DCd81a7E5bC7986E1a0C661c9d9b6aBC4D8a96D',
  QI: '0x8729438EB15e2C8B576fCc6AeCdA6A148776C0F5',
  AVAX: '0xB31f66AA3C1e785363F0875A1B74E27b85FD66c7', // WAVAX
  sAVAX: '0x2b2C81e08f1Af8835a78Bb2A90AE924ACE0eA4bE',
  USDC: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E',
  'USDC.e': '0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664',
  USDT: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7',
  'USDT.e': '0xc7198437980c041c805A1EDcbA50c1Ce5db95118',
  DAI: '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70',
  'DAI.e': '0xd586E7F844cEa2F87f50152665BCbc2C279D8d70',
};

function aggregateApys(aprs, key, locking) {
  const stakingApys = aprs.Staking[key]?.total;
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
    ([k, v], i) => {
      if (['VTXAVAX', 'PTPXPTP', 'ZJOEJOE'].includes(k)) return undefined;

      // Get underlying token address
      const underlyingToken = tokenAddresses[k];

      return {
        pool: `vector-${k}-${i < lockingLength ? 'locking' : 'staking'}`,
        chain: 'Avalanche',
        project: 'vector-finance',
        symbol: utils.formatSymbol(k.replace(/_/g, '-')),
        tvlUsd:
          Number(tvls[i < lockingLength ? 'Locking' : 'Staking'][k]) *
          prices[k],
        apy: aggregateApys(aprs, k, i < lockingLength),
        underlyingTokens: underlyingToken ? [underlyingToken] : undefined,
      };
    }
  );
}

const main = async () => {
  return (await apy()).filter(Boolean).filter((p) => utils.keepFinite(p));
};

module.exports = {
  timetravel: false,
  apy: main,
  url: 'https://vectorfinance.io/stake',
};
