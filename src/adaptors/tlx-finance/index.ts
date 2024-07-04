const sdk = require('@defillama/sdk');
const { getPrices, getBlocksByTime } = require('../utils');
const { utils } = require('ethers');

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

const getTlxPrice = async (timestamp: number | null): Promise<number> => {
  if (!timestamp) {
    const reponse = await getPrices([TLX_ADDRESS], CHAIN);
    return reponse.pricesBySymbol.tlx;
  } else {
    const id = `${CHAIN}:${TLX_ADDRESS}`;
    const url = `https://coins.llama.fi/prices/historical/${timestamp}/${id}`;
    const res = await fetch(url);
    const data: any = await res.json();
    return data.coins[id].price;
  }
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

const getView = async (address: string, name: string): Promise<number> => {
  const abi = `function ${name}() view returns (uint256)`;
  const { output } = await sdk.api.abi.call({
    chain: CHAIN,
    abi,
    target: address,
  });
  return output / 1e18;
};

const apy = async (timestamp: number | null = null) => {
  // General
  const tlxPrice = await getTlxPrice(timestamp);
  const currentBlock = await getBlock(timestamp);

  // Locker
  const rewards = await getView(LOCKER_ADDRESS, 'totalRewards');
  const totalLocked = await getView(LOCKER_ADDRESS, 'totalStaked');
  const timePassed = new Date().getTime() - LOCKER_LAUNCH_DATE.getTime();
  const percentComplete = Math.min(timePassed / LOCK_DURATION, 1);
  const lockerApr = (rewards / totalLocked) * 2 * (1 - percentComplete) * 100;

  // Staker
  const totalStaked = await getView(STAKER_ADDRESS, 'totalStaked');
  const totalPrepared = await getView(STAKER_ADDRESS, 'totalPrepared');
  const startBlock = currentBlock - SAMPLE_PERIOD_BLOCKS;
  const event = 'event DonatedRewards(address indexed account, uint256 amount)';
  const iface = new utils.Interface([event]);
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
  const totalBn = eventArgs.reduce(
    (acc, event) => acc.add(event.amount),
    start
  );
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
