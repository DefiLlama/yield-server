const axios = require('axios');
const {
  getStakePoolInfo,
  calcSolanaLstApy,
  solanaLstPricePerShare,
  getPriceApiUrl,
} = require('../utils');

const PDSOL_MINT = 'aeroXvCT6tjGVNyTvZy86tFDwE4sYsKCh7FbNDcrcxF';
const STAKE_POOL = 'aero2ePURjuEgLKTzcUmF6RypBncBGd7pMUYCoSsVJ6';
const SOL = 'So11111111111111111111111111111111111111112';

const solKey = `solana:${SOL}`;

const apy = async () => {
  const [stakePool, priceRes] = await Promise.all([
    getStakePoolInfo(STAKE_POOL),
    axios.get(getPriceApiUrl(`/prices/current/${solKey}`)),
  ]);

  const solPrice = priceRes?.data?.coins?.[solKey]?.price;
  if (!Number.isFinite(solPrice) || solPrice <= 0)
    throw new Error('Unable to fetch SOL price');

  const apyBase = calcSolanaLstApy(stakePool);
  const pricePerShare = solanaLstPricePerShare(stakePool);

  const feePct = stakePool.epochFee
    ? `${((stakePool.epochFee.numerator / stakePool.epochFee.denominator) * 100).toFixed(0)}% epoch fee`
    : null;

  return [
    {
      pool: PDSOL_MINT,
      chain: 'Solana',
      project: 'phase-delegation',
      symbol: 'pdSOL',
      tvlUsd: stakePool.tvlSol * solPrice,
      apyBase,
      ...(pricePerShare > 0 && { pricePerShare }),
      underlyingTokens: [SOL],
      poolMeta: feePct,
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  protocolId: '8520',
  timetravel: false,
  apy,
  url: 'https://phase.cc/delegation',
};
