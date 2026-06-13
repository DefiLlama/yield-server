const axios = require('axios');
const { getTotalSupply, getSanctumLstApy } = require('../utils');

const PICOSOL_MINT = 'picobAEvs6w7QEknPce34wAE4gknZA9v5tTonnmHYdX';
const priceKey = `solana:${PICOSOL_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyBase] = await Promise.all([
    getTotalSupply(PICOSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    getSanctumLstApy(PICOSOL_MINT),
  ]);

  if (!Number.isFinite(totalSupply))
    throw new Error(`Unable to fetch total supply for ${PICOSOL_MINT}`);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch picoSOL price');

  if (apyBase == null)
    throw new Error(`Unable to fetch APY for ${PICOSOL_MINT}`);

  return [
    {
      pool: PICOSOL_MINT,
      chain: 'Solana',
      project: 'pico-staked-sol',
      symbol: 'picoSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      searchTokenOverride: PICOSOL_MINT,
      poolMeta: '2.5% rewards fee',
      url: 'https://app.sanctum.so/stake/picoSOL',
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://pico-sol.com/',
};
