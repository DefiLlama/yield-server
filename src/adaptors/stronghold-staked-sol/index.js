const axios = require('axios');
const { getTotalSupply, getSanctumLstApy } = require('../utils');

const STRONGSOL_MINT = 'strng7mqqc1MBJJV6vMzYbEqnwVGvKKGKedeCvtktWA';
const priceKey = `solana:${STRONGSOL_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyBase] = await Promise.all([
    getTotalSupply(STRONGSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    getSanctumLstApy(STRONGSOL_MINT),
  ]);

  if (!Number.isFinite(totalSupply))
    throw new Error(`Unable to fetch total supply for ${STRONGSOL_MINT}`);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch strongSOL price');

  if (apyBase == null)
    throw new Error(`Unable to fetch APY for ${STRONGSOL_MINT}`);

  return [
    {
      pool: STRONGSOL_MINT,
      chain: 'Solana',
      project: 'stronghold-staked-sol',
      symbol: 'strongSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      searchTokenOverride: STRONGSOL_MINT,
      poolMeta: '2.5% rewards fee',
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://strongholdsol.com',
};
