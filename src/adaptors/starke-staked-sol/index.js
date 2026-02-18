const axios = require('axios');
const { getTotalSupply } = require('../utils');

const RKSOL_MINT = 'EPCz5LK372vmvCkZH3HgSuGNKACJJwwxsofW6fypCPZL';
const priceKey = `solana:${RKSOL_MINT}`;

const apy = async () => {
  const [totalSupply, priceRes, apyRes] = await Promise.all([
    getTotalSupply(RKSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    axios.get(
      `https://extra-api.sanctum.so/v1/apy/latest?lst=${RKSOL_MINT}`
    ),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch rkSOL price');

  const apyBase = apyRes.data.apys[RKSOL_MINT] * 100;

  return [
    {
      pool: RKSOL_MINT,
      chain: 'Solana',
      project: 'starke-staked-sol',
      symbol: 'rkSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [RKSOL_MINT],
      poolMeta: '2.5% epoch fee',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://starke.finance/rksol',
};
