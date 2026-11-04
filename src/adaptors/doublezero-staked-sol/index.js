const axios = require('axios');
const {
  getStakePoolInfo,
  calcSolanaLstApy,
  getSanctumLstApy,
  getPriceApiUrl,
} = require('../utils');

const DZSOL_MINT = 'Gekfj7SL2fVpTDxJZmeC46cTYxinjB6gkAnb6EGT6mnn';
const STAKE_POOL = '3fV1sdGeXaNEZj6EPDTpub82pYxcRXwt2oie6jkSzeWi';
const SOL = 'So11111111111111111111111111111111111111112';
const solKey = `solana:${SOL}`;

const apy = async () => {
  const [stakePool, priceRes, sanctumApy] = await Promise.all([
    getStakePoolInfo(STAKE_POOL),
    axios.get(getPriceApiUrl(`/prices/current/${solKey}`)),
    getSanctumLstApy(DZSOL_MINT),
  ]);

  const solPrice = priceRes.data.coins[solKey]?.price;
  if (!solPrice) throw new Error('Unable to fetch SOL price');

  const apyBase = sanctumApy ?? calcSolanaLstApy(stakePool);
  if (apyBase == null)
    throw new Error(`Unable to fetch APY for ${DZSOL_MINT}`);

  return [
    {
      pool: DZSOL_MINT,
      chain: 'Solana',
      project: 'doublezero-staked-sol',
      symbol: 'dzSOL',
      tvlUsd: stakePool.tvlSol * solPrice,
      apyBase,
      underlyingTokens: [SOL],
      poolMeta: '6% epoch fee',
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  protocolId: '6976',
  timetravel: false,
  apy,
  url: 'https://doublezero.xyz/staking',
};
