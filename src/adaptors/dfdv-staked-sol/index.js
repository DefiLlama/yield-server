const axios = require('axios');
const { getTotalSupply } = require('../utils');

const DFDVSOL_MINT = 'sctmB7GPi5L2Q5G9tUSzXvhZ4YiDMEGcRov9KfArQpx';
const priceKey = `solana:${DFDVSOL_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyRes] = await Promise.all([
    getTotalSupply(DFDVSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    axios.get(
      `https://extra-api.sanctum.so/v1/apy/latest?lst=${DFDVSOL_MINT}`
    ),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch dfdvSOL price');

  const apyRaw = apyRes?.data?.apys?.[DFDVSOL_MINT];
  if (!Number.isFinite(apyRaw))
    throw new Error(`Unable to fetch APY for ${DFDVSOL_MINT}`);
  const apyBase = apyRaw * 100;

  return [
    {
      pool: DFDVSOL_MINT,
      chain: 'Solana',
      project: 'dfdv-staked-sol',
      symbol: 'dfdvSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      token: DFDVSOL_MINT,
      poolMeta: '0% rewards fee',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://defidevcorp.com/?tab=dfdvSOL',
};
