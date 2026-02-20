const axios = require('axios');
const { getTotalSupply } = require('../utils');

const LST_MINT = 'LnTRntk2kTfWEY6cVB8K9649pgJbt6dJLS1Ns1GZCWg';
const SOL = 'So11111111111111111111111111111111111111112';
const priceKey = `solana:${LST_MINT}`;

const apy = async () => {
  const [totalSupply, priceRes, apyRes] = await Promise.all([
    getTotalSupply(LST_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    axios.get(
      `https://extra-api.sanctum.so/v1/apy/latest?lst=${LST_MINT}`
    ),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch lanternSOL price');

  const apyRaw = apyRes?.data?.apys?.[LST_MINT];
  if (!Number.isFinite(apyRaw))
    throw new Error(`Unable to fetch APY for ${LST_MINT}`);
  const apyBase = apyRaw * 100;

  return [
    {
      pool: LST_MINT,
      chain: 'Solana',
      project: 'lantern-staked-sol',
      symbol: 'lanternSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      token: LST_MINT,
      poolMeta: '5% epoch fee',
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.lantern.one/stake',
};
