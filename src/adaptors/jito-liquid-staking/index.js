const axios = require('axios');
const { getTotalSupply } = require('../utils');

const JITOSOL_ADDRESS = 'J1toso1uCk3RLmjorhTtrVwY9HJ7X8V9yYac6Y7kGCPn';
const priceKey = `solana:${JITOSOL_ADDRESS}`;

const apy = async () => {
  const totalSupply = await getTotalSupply(JITOSOL_ADDRESS);

  const priceResponse = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}`
  );
  const currentPrice = priceResponse.data.coins[priceKey].price;

  const jitoResponse = await axios.get(
    'https://www.jito.network/api/getJitoPoolStatsRecentOnly/'
  ).then((res) => res.data);
  const apy = jitoResponse.latestApy;

  return [
    {
      pool: JITOSOL_ADDRESS,
      chain: 'Solana',
      project: 'jito-liquid-staking',
      symbol: 'JITOSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase: Number(apy),
      underlyingTokens: [JITOSOL_ADDRESS],
    },
  ];
};

module.exports = { apy, url: 'https://www.jito.network/staking/' };
