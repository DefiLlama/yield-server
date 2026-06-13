const axios = require('axios');
const { getTotalSupply, getSanctumLstApy } = require('../utils');

const PSOL_MINT = 'pSo1f9nQXWgXibFtKf7NWYxb5enAM4qfP6UJSiXRQfL';
const priceKey = `solana:${PSOL_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyBase] = await Promise.all([
    getTotalSupply(PSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    getSanctumLstApy(PSOL_MINT),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch PSOL price');

  if (apyBase == null)
    throw new Error(`Unable to fetch APY for ${PSOL_MINT}`);

  return [
    {
      pool: PSOL_MINT,
      chain: 'Solana',
      project: 'phantom-sol',
      symbol: 'PSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      searchTokenOverride: PSOL_MINT,
      poolMeta: '0% rewards fee',
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://phantom.com',
};
