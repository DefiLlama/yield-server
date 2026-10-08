const axios = require('axios');
const {
  getStakePoolInfo,
  calcSolanaLstApy,
  solanaLstPricePerShare,
  getPriceApiUrl,
} = require('../utils');

const BULKSOL_MINT = 'BULKoNSGzxtCqzwTvg5hFJg8fx6dqZRScyXe5LYMfxrn';
const STAKE_POOL = '3aUmJDNpMHjkxunQEkHTj2chzyryKoH2uQj6YACLD174';
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
    ? `${(
        (stakePool.epochFee.numerator / stakePool.epochFee.denominator) *
        100
      ).toFixed(0)}% epoch fee`
    : undefined;

  return [
    {
      pool: BULKSOL_MINT,
      chain: 'Solana',
      project: 'bulk',
      symbol: 'BulkSOL',
      tvlUsd: stakePool.tvlSol * solPrice,
      apyBase,
      ...(pricePerShare > 0 && { pricePerShare }),
      underlyingTokens: [SOL],
      token: BULKSOL_MINT,
      poolMeta: feePct,
      isIntrinsicSource: true,
      url: 'https://app.bulk.trade/stake',
    },
  ];
};

module.exports = {
  protocolId: '7987',
  timetravel: false,
  apy,
  url: 'https://www.bulk.trade/',
};
