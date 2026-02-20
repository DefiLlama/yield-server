const axios = require('axios');
const { getTotalSupply } = require('../utils');

const HYLOSOL_MINT = 'hy1oXYgrBW6PVcJ4s6s2FKavRdwgWTXdfE69AxT7kPT';
const priceKey = `solana:${HYLOSOL_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyRes] = await Promise.all([
    getTotalSupply(HYLOSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    axios.get(
      `https://extra-api.sanctum.so/v1/apy/latest?lst=${HYLOSOL_MINT}`
    ),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch hyloSOL price');

  const apyRaw = apyRes?.data?.apys?.[HYLOSOL_MINT];
  if (!Number.isFinite(apyRaw))
    throw new Error(`Unable to fetch APY for ${HYLOSOL_MINT}`);
  const apyBase = apyRaw * 100;

  return [
    {
      pool: HYLOSOL_MINT,
      chain: 'Solana',
      project: 'hylo-lsts',
      symbol: 'hyloSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      token: HYLOSOL_MINT,
      poolMeta: '0% rewards fee',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://hylo.so/lst',
};
