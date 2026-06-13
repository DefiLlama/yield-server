const axios = require('axios');
const { getTotalSupply, getSanctumLstApy } = require('../utils');

const JUPSOL_ADDRESS = 'jupSoLaHXQiZZTSfEWMTRRgpnyFm8f6sZdosWBjx93v';
const SOL = 'So11111111111111111111111111111111111111112';
const priceKey = `solana:${JUPSOL_ADDRESS}`;

const apy = async () => {
  const [apyBase, priceResponse, totalSupply] = await Promise.all([
    getSanctumLstApy(JUPSOL_ADDRESS),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    getTotalSupply(JUPSOL_ADDRESS),
  ]);

  if (apyBase == null)
    throw new Error(`Unable to fetch APY for ${JUPSOL_ADDRESS}`);
  const currentPrice = priceResponse.data.coins[priceKey].price;
  const tvlUsd = totalSupply * currentPrice;

  return [
    {
      pool: JUPSOL_ADDRESS,
      chain: 'Solana',
      project: 'jupiter-staked-sol',
      symbol: 'JUPSOL',
      tvlUsd: tvlUsd,
      apyBase,
      underlyingTokens: [SOL],
      searchTokenOverride: JUPSOL_ADDRESS,
      isIntrinsicSource: true,

    },
  ];
};

module.exports = { apy, url: 'https://station.jup.ag/guides/jupsol/jupsol' };
