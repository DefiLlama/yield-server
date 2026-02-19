const axios = require('axios');
const { getTotalSupply } = require('../utils');

const DZSOL_MINT = 'Gekfj7SL2fVpTDxJZmeC46cTYxinjB6gkAnb6EGT6mnn';
const priceKey = `solana:${DZSOL_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyRes] = await Promise.all([
    getTotalSupply(DZSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    axios.get(
      `https://extra-api.sanctum.so/v1/apy/latest?lst=${DZSOL_MINT}`
    ),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch dzSOL price');

  const apyRaw = apyRes?.data?.apys?.[DZSOL_MINT];
  if (!Number.isFinite(apyRaw))
    throw new Error(`Unable to fetch APY for ${DZSOL_MINT}`);
  const apyBase = apyRaw * 100;

  return [
    {
      pool: DZSOL_MINT,
      chain: 'Solana',
      project: 'doublezero-staked-sol',
      symbol: 'dzSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      token: DZSOL_MINT,
      poolMeta: '6% epoch fee',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://doublezero.xyz/staking',
};
