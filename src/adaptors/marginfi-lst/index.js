const axios = require('axios');
const { getTotalSupply } = require('../utils');

const LST_MINT = 'LSTxxxnJzKDFSLr4dUkPcmCf5VyryEqzPLz5j4bpxFp';
const priceKey = `solana:${LST_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyRes] = await Promise.all([
    getTotalSupply(LST_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    axios.get(
      `https://extra-api.sanctum.so/v1/apy/latest?lst=${LST_MINT}`
    ),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch LST price');

  const apyRaw = apyRes?.data?.apys?.[LST_MINT];
  if (!Number.isFinite(apyRaw))
    throw new Error(`Unable to fetch APY for ${LST_MINT}`);
  const apyBase = apyRaw * 100;

  return [
    {
      pool: LST_MINT,
      chain: 'Solana',
      project: 'marginfi-lst',
      symbol: 'LST',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      token: LST_MINT,
      poolMeta: '0% rewards fee',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.marginfi.com/stake',
};
