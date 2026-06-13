const axios = require('axios');
const { getTotalSupply, getSanctumLstApy } = require('../utils');

const DZSOL_MINT = 'Gekfj7SL2fVpTDxJZmeC46cTYxinjB6gkAnb6EGT6mnn';
const priceKey = `solana:${DZSOL_MINT}`;
const SOL = 'So11111111111111111111111111111111111111112';

const apy = async () => {
  const [totalSupply, priceRes, apyBase] = await Promise.all([
    getTotalSupply(DZSOL_MINT),
    axios.get(`https://coins.llama.fi/prices/current/${priceKey}`),
    getSanctumLstApy(DZSOL_MINT),
  ]);

  const currentPrice = priceRes.data.coins[priceKey]?.price;
  if (!currentPrice) throw new Error('Unable to fetch dzSOL price');

  if (apyBase == null)
    throw new Error(`Unable to fetch APY for ${DZSOL_MINT}`);

  return [
    {
      pool: DZSOL_MINT,
      chain: 'Solana',
      project: 'doublezero-staked-sol',
      symbol: 'dzSOL',
      tvlUsd: totalSupply * currentPrice,
      apyBase,
      underlyingTokens: [SOL],
      searchTokenOverride: DZSOL_MINT,
      poolMeta: '6% epoch fee',
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://doublezero.xyz/staking',
};
