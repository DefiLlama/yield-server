const axios = require('axios');
const { getTotalSupply } = require('../utils');

const JUPSOL_ADDRESS = 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v';
const priceKey = `solana:${JUPSOL_ADDRESS}`;

const apy = async () => {
  const [apyResponse, priceResponse, totalSupply] = await Promise.all([
    axios.get('https://worker.jup.ag/lst-apys'),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    getTotalSupply(JUPSOL_ADDRESS),
  ]);

  const apyValue = apyResponse.data.apys[JUPSOL_ADDRESS];
  const currentPrice = priceResponse.data.coins[priceKey].price;
  const tvlUsd = totalSupply * currentPrice;

  return [
    {
      pool: JUPSOL_ADDRESS,
      chain: 'Solana',
      project: 'jupiter-staked-sol',
      symbol: 'JUPSOL',
      tvlUsd: tvlUsd,
      apyBase: apyValue * 100,
      underlyingTokens: [JUPSOL_ADDRESS],
    },
  ];
};

module.exports = { apy, url: 'https://station.jup.ag/guides/jupsol/jupsol' };
