const axios = require('axios');
const { getTotalSupply } = require('../utils');

const MSOL_ADDRESS = 'mSoLzYCxHdYgdzU16g5QSh3i5K3z3KZK7ytfqcJm7So';
const priceKey = `solana:${MSOL_ADDRESS}`;

const apy = async () => {
  const [apyResponse, priceResponse, totalSupply] = await Promise.all([
    axios.get('https://api.marinade.finance/msol/apy/7d'),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    getTotalSupply(MSOL_ADDRESS),
  ]);

  const apyValue = apyResponse.data.value;
  const currentPrice = priceResponse.data.coins[priceKey].price;
  const tvlUsd = totalSupply * currentPrice;

  return [
    {
      pool: MSOL_ADDRESS,
      chain: 'Solana',
      project: 'marinade-liquid-staking',
      symbol: 'MSOL',
      tvlUsd: tvlUsd,
      apyBase: apyValue * 100,
      underlyingTokens: [MSOL_ADDRESS],
    },
  ];
};

module.exports = { apy, url: 'https://marinade.finance/liquid-staking' };
