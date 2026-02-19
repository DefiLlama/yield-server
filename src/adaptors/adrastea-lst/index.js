const axios = require('axios');
const { getStakePoolInfo, calcSolanaLstApy } = require('../utils');

const ADRASOL_MINT = 'sctmY8fJucsJatwHz6P48RuWBBkdBMNmSMuBYrWFdrw';
const STAKE_POOL = '2XhsHdwf4ZDpp2JhpTqPovoVy3L2Atfp1XkLqFMwGP4Y';
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
    ? `${((stakePool.epochFee.numerator / stakePool.epochFee.denominator) * 100).toFixed(1)}% epoch fee`
    : null;

  return [
    {
      pool: ADRASOL_MINT,
      chain: 'Solana',
      project: 'adrastea-lst',
      symbol: 'adraSOL',
      tvlUsd: stakePool.tvlSol * solPrice,
      apyBase,
      underlyingTokens: [SOL],
      token: ADRASOL_MINT,
      poolMeta: feePct,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.adrastea.fi/staking',
};
