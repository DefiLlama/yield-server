const axios = require('axios');
const { getTotalSupply } = require('../utils');

const STRONGSOL_MINT = 'strng7mqqc1MBJJV6vMzYbEqnwVGvKKGKedeCvtktWA';
const priceKey = `solana:${STRONGSOL_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyRes] = await Promise.all([
    getTotalSupply(STRONGSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    axios.get(
      `https://extra-api.sanctum.so/v1/apy/latest?lst=${STRONGSOL_MINT}`
    ),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch strongSOL price');

  const apyRaw = apyRes?.data?.apys?.[STRONGSOL_MINT];
  if (!Number.isFinite(apyRaw))
    throw new Error(`Unable to fetch APY for ${STRONGSOL_MINT}`);
  const apyBase = apyRaw * 100;

  return [
    {
      pool: STRONGSOL_MINT,
      chain: 'Solana',
      project: 'stronghold-staked-sol',
      symbol: 'strongSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      token: STRONGSOL_MINT,
      poolMeta: '2.5% rewards fee',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://strongholdsol.com',
};
