const axios = require('axios');
const { getTotalSupply } = require('../utils');

const BSOL_MINT = 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1';
const priceKey = `solana:${BSOL_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyRes] = await Promise.all([
    getTotalSupply(BSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    axios.get(
      `https://extra-api.sanctum.so/v1/apy/latest?lst=${BSOL_MINT}`
    ),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch bSOL price');

  const apyRaw = apyRes?.data?.apys?.[BSOL_MINT];
  if (!Number.isFinite(apyRaw))
    throw new Error(`Unable to fetch APY for ${BSOL_MINT}`);
  const apyBase = apyRaw * 100;

  return [
    {
      pool: BSOL_MINT,
      chain: 'Solana',
      project: 'blazestake',
      symbol: 'bSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      token: BSOL_MINT,
      poolMeta: '5% rewards fee',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://stake.solblaze.org/app/',
};
