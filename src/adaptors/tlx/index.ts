const sdk = require('@defillama/sdk');
const { getPrices } = require('../utils');

const LOCKER_ADDRESS = '0xc068c3261522c97ff719dc97c98c63a1356fef0f';
const TLX_ADDRESS = '0xd9cc3d70e730503e7f28c1b407389198c4b75fa2';

const LOCKER_LAUNCH_DATE = new Date(1712731443000);
const LOCK_DURATION = 26 * 7 * 24 * 60 * 60 * 1000; // 26 weeks
const CHAIN = 'optimism';

const getTlxPrice = async (): Promise<number> => {
  const reponse = await getPrices([TLX_ADDRESS], CHAIN);
  return reponse.pricesBySymbol.tlx;
};

const apy = async (timestamp: number | null = null) => {
  const tlxPrice = await getTlxPrice();

  const { output: totalRewardsBn } = await sdk.api.abi.call({
    chain: CHAIN,
    abi: 'function totalRewards() view returns (uint256)',
    target: LOCKER_ADDRESS,
  });
  const totalRewards = totalRewardsBn / 1e18;

  const { output: totalLockedBn } = await sdk.api.abi.call({
    chain: CHAIN,
    abi: 'function totalStaked() view returns (uint256)',
    target: LOCKER_ADDRESS,
  });
  const totalLocked = totalLockedBn / 1e18;

  const timePassed = new Date().getTime() - LOCKER_LAUNCH_DATE.getTime();
  const percentComplete = Math.min(timePassed / LOCK_DURATION, 1);
  const lockerApr =
    (totalRewards / totalLocked) * 2 * (1 - percentComplete) * 100;

  return [
    {
      pool: 'tlx-locker',
      chain: 'optimism',
      project: 'tlx-finance',
      symbol: 'lockedTLX',
      tvlUsd: totalLocked * tlxPrice,
      apyBase: 0,
      apyReward: lockerApr,
      rewardTokens: [TLX_ADDRESS],
      underlyingTokens: [TLX_ADDRESS],
      poolMeta: 'TLX Genesis Locker',
    },
  ];
};

module.exports = {
  timetravel: true,
  apy: apy,
  url: 'https://tlx.fi/rewards',
};
