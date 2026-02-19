const axios = require('axios');
const { getTotalSupply } = require('../utils');

const BONKSOL_MINT = 'BonK1YhkXEGLZzwtcvRTip3gAL9nCeQD7ppZBLXhtTs';
const priceKey = `solana:${BONKSOL_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyRes] = await Promise.all([
    getTotalSupply(BONKSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    axios.get(
      `https://extra-api.sanctum.so/v1/apy/latest?lst=${BONKSOL_MINT}`
    ),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch bonkSOL price');

  const apyRaw = apyRes?.data?.apys?.[BONKSOL_MINT];
  if (!Number.isFinite(apyRaw))
    throw new Error(`Unable to fetch APY for ${BONKSOL_MINT}`);
  const apyBase = apyRaw * 100;

  return [
    {
      pool: BONKSOL_MINT,
      chain: 'Solana',
      project: 'bonk-staked-sol',
      symbol: 'bonkSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      token: BONKSOL_MINT,
      poolMeta: '5% rewards fee',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://stake.bonkcoin.com',
};
