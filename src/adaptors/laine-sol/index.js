const axios = require('axios');
const { getStakePoolInfo, calcSolanaLstApy } = require('../utils');

const LAINESOL_MINT = 'LAinEtNLgpmCP9Rvsf5Hn8W6EhNiKLZQti1xfWMLy6X';
const STAKE_POOL = '2qyEeSAWKfU18AFthrF7JA8z8ZCi1yt76Tqs917vwQTV';
const SOL = 'So11111111111111111111111111111111111111112';

const solKey = `solana:${SOL}`;

const apy = async () => {
  const [stakePool, priceRes] = await Promise.all([
    getStakePoolInfo(STAKE_POOL),
    axios.get(`https://coins.llama.fi/prices/current/${solKey}`),
  ]);

  const solPrice = priceRes.data.coins[solKey]?.price;
  if (!solPrice) throw new Error('Unable to fetch SOL price');

  const apyBase = calcSolanaLstApy(stakePool);

  const feePct = stakePool.epochFee
    ? `${((stakePool.epochFee.numerator / stakePool.epochFee.denominator) * 100).toFixed(0)}% epoch fee`
    : null;

  return [
    {
      pool: LAINESOL_MINT,
      chain: 'Solana',
      project: 'laine-sol',
      symbol: 'laineSOL',
      tvlUsd: stakePool.tvlSol * solPrice,
      apyBase,
      underlyingTokens: [SOL],
      token: LAINESOL_MINT,
      poolMeta: feePct,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://stake.laine.one/',
};
