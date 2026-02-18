const axios = require('axios');
const { getStakePoolInfo, calcSolanaLstApy } = require('../utils');

const JAGSOL_MINT = 'jag58eRBC1c88LaAsRPspTMvoKJPbnzw9p9fREzHqyV';
const STAKE_POOL = 'jagEdDepWUgexiu4jxojcRWcVKKwFqgZBBuAoGu2BxM';
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
      pool: JAGSOL_MINT,
      chain: 'Solana',
      project: 'jagpool-staked-sol',
      symbol: 'jagSOL',
      tvlUsd: stakePool.tvlSol * solPrice,
      apyBase,
      underlyingTokens: [SOL],
      tokenAddress: JAGSOL_MINT,
      poolMeta: feePct,
    },
  ];
};

module.exports = {
  timetravel: false,
  apy,
  url: 'https://www.jagpool.xyz/stake',
};
