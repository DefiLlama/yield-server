const axios = require('axios');
const {
  getStakePoolInfo,
  calcSolanaLstApy,
  solanaLstPricePerShare,
  getPriceApiUrl,
} = require('../utils');

const BPSOL_MINT = 'BPSoLzmLQn47EP5aa7jmFngRL8KC3TWAeAwXwZD8ip3P';
const STAKE_POOL = 'ETVc1GBAiKzv2gNaA3Hfq4hsS1Mzh1NwQSxRFst7k8vz';
const SOL = 'So11111111111111111111111111111111111111112';

const solKey = `solana:${SOL}`;

const apy = async () => {
  const [stakePool, priceRes] = await Promise.all([
    getStakePoolInfo(STAKE_POOL),
    axios.get(getPriceApiUrl(`/prices/current/${solKey}`)),
  ]);

  const solPrice = priceRes.data.coins[solKey]?.price;
  if (!solPrice) throw new Error('Unable to fetch SOL price');

  const apyBase = calcSolanaLstApy(stakePool);
  const pricePerShare = solanaLstPricePerShare(stakePool);

  const feePct = stakePool.epochFee
    ? `${((stakePool.epochFee.numerator / stakePool.epochFee.denominator) * 100).toFixed(0)}% epoch fee`
    : undefined;

  return [
    {
      pool: BPSOL_MINT,
      chain: 'Solana',
      project: 'backpack-sol',
      symbol: 'bpSOL',
      tvlUsd: stakePool.tvlSol * solPrice,
      apyBase,
      ...(pricePerShare > 0 && { pricePerShare }),
      underlyingTokens: [SOL],
      token: BPSOL_MINT,
      poolMeta: feePct,
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  protocolId: '7161',
  timetravel: false,
  apy,
  url: 'https://support.backpack.exchange/wallet/actions/stake-sol',
};
