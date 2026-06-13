const axios = require('axios');
const utils = require('../utils');
const { getTotalSupply, getSanctumLstApy } = utils;

const DSOL_ADDRESS = 'Dso1bDeDjCQxTrWHqUUi63oBvV7Mdm6WaobLbQ7gnPQ'
const SOL = 'So11111111111111111111111111111111111111112';
const priceKey = `solana:${DSOL_ADDRESS}`;

const apy = async () => {
  const [totalSupply, priceResponse, apyBase] = await Promise.all([
    getTotalSupply(DSOL_ADDRESS),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    getSanctumLstApy(DSOL_ADDRESS),
  ]);

  const currentPrice = priceResponse.data.coins[priceKey].price;
  if (apyBase == null)
    throw new Error(`Unable to fetch APY for ${DSOL_ADDRESS}`);

  return [
    {
      pool: DSOL_ADDRESS,
      chain: utils.formatChain('solana'),
      project: 'drift-staked-sol',
      symbol: 'dSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      searchTokenOverride: DSOL_ADDRESS,
      isIntrinsicSource: true,
    },
  ];
};

module.exports = { apy, url: 'https://app.drift.trade/earn/dsol-liquid-staking' };
