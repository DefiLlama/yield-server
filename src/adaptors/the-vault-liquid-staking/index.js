const axios = require('axios');
const { getTotalSupply } = require('../utils');

const VSOL_MINT = 'vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7';
const priceKey = `solana:${VSOL_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyRes] = await Promise.all([
    getTotalSupply(VSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    axios.get(
      `https://extra-api.sanctum.so/v1/apy/latest?lst=${VSOL_MINT}`
    ),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch vSOL price');

  const apyRaw = apyRes?.data?.apys?.[VSOL_MINT];
  if (!Number.isFinite(apyRaw))
    throw new Error(`Unable to fetch APY for ${VSOL_MINT}`);
  const apyBase = apyRaw * 100;

  return [
    {
      pool: VSOL_MINT,
      chain: 'Solana',
      project: 'the-vault-liquid-staking',
      symbol: 'vSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      token: VSOL_MINT,
      poolMeta: '5% rewards fee',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://thevault.finance/stake',
};
