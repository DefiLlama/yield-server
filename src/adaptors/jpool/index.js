const axios = require('axios');
const { getTotalSupply } = require('../utils');

const JSOL_MINT = '7Q2afV64in6N6SeZsAAB81TJzwDoD6zpqmHkzi9Dcavn';
const priceKey = `solana:${JSOL_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyRes] = await Promise.all([
    getTotalSupply(JSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    axios.get(
      `https://extra-api.sanctum.so/v1/apy/latest?lst=${JSOL_MINT}`
    ),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch JSOL price');

  const apyRaw = apyRes?.data?.apys?.[JSOL_MINT];
  if (!Number.isFinite(apyRaw))
    throw new Error(`Unable to fetch APY for ${JSOL_MINT}`);
  const apyBase = apyRaw * 100;

  return [
    {
      pool: JSOL_MINT,
      chain: 'Solana',
      project: 'jpool',
      symbol: 'JSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      token: JSOL_MINT,
      poolMeta: '7% rewards fee',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.jpool.one/',
};
