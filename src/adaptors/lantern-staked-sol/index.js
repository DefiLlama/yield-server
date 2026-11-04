const axios = require('axios');
const {
  getStakePoolInfo,
  calcSolanaLstApy,
  getSanctumLstApy,
  getPriceApiUrl,
} = require('../utils');

const LST_MINT = 'LnTRntk2kTfWEY6cVB8K9649pgJbt6dJLS1Ns1GZCWg';
const STAKE_POOL = 'LW3qEdGWdVrxNgxSXW8vZri7Jifg4HuKEQ1UABLxs3C';
const SOL = 'So11111111111111111111111111111111111111112';
const solKey = `solana:${SOL}`;

const apy = async () => {
  const [stakePool, priceRes, sanctumApy] = await Promise.all([
    getStakePoolInfo(STAKE_POOL),
    axios.get(getPriceApiUrl(`/prices/current/${solKey}`)),
    getSanctumLstApy(LST_MINT),
  ]);

  const solPrice = priceRes.data.coins[solKey]?.price;
  if (!solPrice) throw new Error('Unable to fetch SOL price');

  const apyBase = sanctumApy ?? calcSolanaLstApy(stakePool);
  if (apyBase == null)
    throw new Error(`Unable to fetch APY for ${LST_MINT}`);

  return [
    {
      pool: LST_MINT,
      chain: 'Solana',
      project: 'lantern-staked-sol',
      symbol: 'lanternSOL',
      tvlUsd: stakePool.tvlSol * solPrice,
      apyBase,
      underlyingTokens: [SOL],
      poolMeta: '5% epoch fee',
      isIntrinsicSource: true,
    },
  ];
};

module.exports = {
  protocolId: '7313',
  timetravel: false,
  apy,
  url: 'https://www.lantern.one/stake',
};
