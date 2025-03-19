const axios = require('axios');
const { getTotalSupply } = require('../utils');
const utils = require('../utils');

const DSOL_ADDRESS = 'Dso1bDeDjCQxTrWHqUUi63oBvV7Mdm6WaobLbQ7gnPQ'
const priceKey = `solana:${DSOL_ADDRESS}`;

const apy = async () => {
  const totalSupply = await getTotalSupply(DSOL_ADDRESS);

  const priceResponse = await axios.get(
    `https://coins.llama.fi/prices/current/${priceKey}`
  );
  const currentPrice = priceResponse.data.coins[priceKey].price;

  const driftResponse = await axios.get(
    'https://extra-api.sanctum.so/v1/apy/latest?lst=dSOL'
  );
  const apy = driftResponse.data.apys.dSOL;

  return [
    {
      pool: DSOL_ADDRESS,
      chain: utils.formatChain('solana'),
      project: 'drift-staked-sol',
      symbol: 'dSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase: apy * 100,
      underlyingTokens: [DSOL_ADDRESS],
    },
  ];
};

module.exports = { apy, url: 'https://app.drift.trade/earn/dsol-liquid-staking' };
