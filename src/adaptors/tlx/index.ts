const sdk = require('@defillama/sdk');
const { getPrices, getBlocksByTime } = require('../utils');
const ethers = require('ethers');

// TODO There should be a cleaner way to get the 30 days ago using their 'getLatestBlock' function
// TODO Add timetravel support
// TODO Clean up
// Simplify ethers import

const LOCKER_ADDRESS = '0xc068c3261522c97ff719dc97c98c63a1356fef0f';
const TLX_ADDRESS = '0xd9cc3d70e730503e7f28c1b407389198c4b75fa2';
const STAKER_ADDRESS = '0xc30877315f3b621a8f7bcda27819ec29429f3817';
const SUSD_ADDRESS = '0x8c6f28f2F1A3C87F0f938b96d27520d9751ec8d9';

const LOCKER_LAUNCH_DATE = new Date(1712731443000);
const LOCK_DURATION = 26 * 7 * 24 * 60 * 60 * 1000; // 26 weeks
const CHAIN = 'optimism';
const SAMPLE_PERIOD_DAYS = 30;
const SECONDS_PER_BLOCK = 2;
const SECONDS_IN_A_DAY = 24 * 60 * 60;
const SAMPLE_PERIOD_SECONDS = SAMPLE_PERIOD_DAYS * SECONDS_IN_A_DAY;
const SAMPLE_PERIOD_BLOCKS = SAMPLE_PERIOD_SECONDS / SECONDS_PER_BLOCK;
const BLOCKS_PER_YEAR = (365 * SECONDS_IN_A_DAY) / SECONDS_PER_BLOCK;

const getTlxPrice = async (): Promise<number> => {
  const reponse = await getPrices([TLX_ADDRESS], CHAIN);
  return reponse.pricesBySymbol.tlx;
};

const getBlock = async (timestamp: number | null): Promise<number> => {
  if (timestamp) {
    const [block] = await getBlocksByTime([timestamp], CHAIN);
    return block;
  } else {
    const block = await sdk.api.util.getLatestBlock(CHAIN);
    return block.number;
  }
};

const apy = async (timestamp: number | null = null) => {
  // General
  const tlxPrice = await getTlxPrice();
  const currentBlock = await getBlock(timestamp);

  // Locker
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

  // Staker
  const { output: totalStakedBn } = await sdk.api.abi.call({
    chain: CHAIN,
    abi: 'function totalStaked() view returns (uint256)',
    target: STAKER_ADDRESS,
  });
  const totalStaked = totalStakedBn / 1e18;
  const { output: totalPreparedBn } = await sdk.api.abi.call({
    chain: CHAIN,
    abi: 'function totalPrepared() view returns (uint256)',
    target: STAKER_ADDRESS,
  });
  const totalPrepared = totalPreparedBn / 1e18;

  const startBlock = currentBlock - SAMPLE_PERIOD_BLOCKS;

  const event = 'event DonatedRewards(address indexed account, uint256 amount)';
  const iface = new ethers.utils.Interface([event]);
  const events = (
    await sdk.api.util.getLogs({
      target: STAKER_ADDRESS,
      topic: '',
      fromBlock: startBlock,
      toBlock: currentBlock,
      topics: [iface.getEventTopic('DonatedRewards')],
      keys: [],
      chain: CHAIN,
    })
  ).output.filter((ev) => !ev.removed);
  const eventArgs = events.map((ev) => iface.parseLog(ev).args);
  const firstEventBlock = events[0].blockNumber;
  const annualMultiplier = BLOCKS_PER_YEAR / (currentBlock - firstEventBlock);
  const start = eventArgs[0].amount.sub(eventArgs[0].amount);
  const totalBn = eventArgs.reduce((acc, event) => {
    if (!event.amount) {
      return acc;
    }
    return acc.add(event.amount);
  }, start);
  const total = totalBn / 1e18;
  const annualStakerEarnings = total * annualMultiplier;
  const totalActive = totalStaked - totalPrepared;
  const totalActiveUsd = totalActive * tlxPrice;
  const stakerApr = (annualStakerEarnings / totalActiveUsd) * 100;

  return [
    {
      pool: 'tlx-locker',
      chain: CHAIN,
      project: 'tlx-finance',
      symbol: 'lockedTLX',
      tvlUsd: totalLocked * tlxPrice,
      apyBase: 0,
      apyReward: lockerApr,
      rewardTokens: [TLX_ADDRESS],
      underlyingTokens: [TLX_ADDRESS],
      poolMeta: 'TLX Genesis Locker',
    },
    {
      pool: 'tlx-staker',
      chain: CHAIN,
      project: 'tlx-finance',
      symbol: 'stTLX',
      tvlUsd: totalStaked * tlxPrice,
      apyBase: 0,
      apyReward: stakerApr,
      rewardTokens: [SUSD_ADDRESS],
      underlyingTokens: [TLX_ADDRESS],
      poolMeta: 'TLX Staker',
    },
  ];
};

module.exports = {
  timetravel: true,
  apy: apy,
  url: 'https://tlx.fi/rewards',
};
