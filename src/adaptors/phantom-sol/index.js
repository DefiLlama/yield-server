const axios = require('axios');
const { getTotalSupply } = require('../utils');

const PSOL_MINT = 'pSo1f9nQXWgXibFtKf7NWYxb5enAM4qfP6UJSiXRQfL';
const priceKey = `solana:${PSOL_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyRes] = await Promise.all([
    getTotalSupply(PSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    axios.get(
      `https://extra-api.sanctum.so/v1/apy/latest?lst=${PSOL_MINT}`
    ),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch PSOL price');

  const apyRaw = apyRes?.data?.apys?.[PSOL_MINT];
  if (!Number.isFinite(apyRaw))
    throw new Error(`Unable to fetch APY for ${PSOL_MINT}`);
  const apyBase = apyRaw * 100;

  return [
    {
      pool: PSOL_MINT,
      chain: 'Solana',
      project: 'phantom-sol',
      symbol: 'PSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      token: PSOL_MINT,
      poolMeta: '0% rewards fee',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://phantom.com',
};
