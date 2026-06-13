const axios = require('axios');
const { getTotalSupply, getSanctumLstApy } = require('../utils');

const VSOL_MINT = 'vSoLxydx6akxyMD9XEcPvGYNGq6Nn66oqVb3UkGkei7';
const priceKey = `solana:${VSOL_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyBase] = await Promise.all([
    getTotalSupply(VSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    getSanctumLstApy(VSOL_MINT),
  ]);

  if (!Number.isFinite(totalSupply))
    throw new Error(`Unable to fetch total supply for ${VSOL_MINT}`);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch vSOL price');

  if (apyBase == null)
    throw new Error(`Unable to fetch APY for ${VSOL_MINT}`);

  return [
    {
      pool: VSOL_MINT,
      chain: 'Solana',
      project: 'the-vault-liquid-staking',
      symbol: 'vSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      searchTokenOverride: VSOL_MINT,
      poolMeta: '5% rewards fee',
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://thevault.finance/stake',
};
