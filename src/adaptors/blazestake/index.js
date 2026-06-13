const axios = require('axios');
const { getTotalSupply, getSanctumLstApy } = require('../utils');

const BSOL_MINT = 'bSo13r4TkiE4KumL71LsHTPpL2euBYLFx6h9HP3piy1';
const priceKey = `solana:${BSOL_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyBase] = await Promise.all([
    getTotalSupply(BSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    getSanctumLstApy(BSOL_MINT),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch bSOL price');

  if (apyBase == null)
    throw new Error(`Unable to fetch APY for ${BSOL_MINT}`);

  return [
    {
      pool: BSOL_MINT,
      chain: 'Solana',
      project: 'blazestake',
      symbol: 'bSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      searchTokenOverride: BSOL_MINT,
      poolMeta: '5% rewards fee',
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://stake.solblaze.org/app/',
};
