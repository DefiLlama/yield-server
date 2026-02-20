const axios = require('axios');
const { getStakePoolInfo, calcSolanaLstApy } = require('../utils');

const STKESOL_MINT = 'stke7uu3fXHsGqKVVjKnkmj65LRPVrqr4bLG2SJg7rh';
const STAKE_POOL = 'StKeDUdSu7jMSnPJ1MPqDnk3RdEwD2QbJaisHMebGhw';
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

  // Dynamic pool meta from on-chain fee
  const feePct = stakePool.epochFee
    ? `${((stakePool.epochFee.numerator / stakePool.epochFee.denominator) * 100).toFixed(0)}% epoch fee`
    : null;

  return [
    {
      pool: STKESOL_MINT,
      chain: 'Solana',
      project: 'stkesol-by-sol-strategies',
      symbol: 'STKESOL',
      tvlUsd: stakePool.tvlSol * solPrice,
      apyBase,
      underlyingTokens: [SOL],
      token: STKESOL_MINT,
      poolMeta: feePct,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://app.solstrategies.io',
};
