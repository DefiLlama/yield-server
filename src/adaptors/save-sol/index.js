const axios = require('axios');
const { getStakePoolInfo, calcSolanaLstApy } = require('../utils');

const SAVESOL_MINT = 'SAVEDpx3nFNdzG3ymJfShYnrBuYy7LtQEABZQ3qtTFt';
const STAKE_POOL = 'SAVEY1fVMBeRVo9V9rgEz8ENTvHreftd3QgpAKBDFV4';
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
      pool: SAVESOL_MINT,
      chain: 'Solana',
      project: 'save-sol',
      symbol: 'saveSOL',
      tvlUsd: stakePool.tvlSol * solPrice,
      apyBase,
      underlyingTokens: [SOL],
      token: SAVESOL_MINT,
      poolMeta: feePct,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://save.finance/saveSOL',
};
