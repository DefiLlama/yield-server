const axios = require('axios');
const utils = require('../utils');

// KTON liquid staking pool and its jetton.
const POOL = 'EQA9HwEZD_tONfVz6lJS0PVKR5viEiEGyj9AuQewGQVnXPg0';
const KTON = 'EQBuIhXNNkWf9AW9miNGNTSO_uFZ23ejfIWrieXge5f733mw';

// The share price steps once per payout: the pool lends in every other
// validation round, so payouts come every two rounds (2 x 65536 s, TON config
// param 15, about 36.4 h). A window of whole payout cycles holds the same
// number of payouts wherever it starts; any other length would count 13 or
// 14 of them depending on the time of day. 14 cycles is about 21.2 days.
const PAYOUT_CYCLE = 2 * 65536;
const WINDOW = 14 * PAYOUT_CYCLE;
const YEAR = 365 * 24 * 60 * 60;

// get_pool_full_data of this contract version returns 34 values:
// total_balance at 2 and supply (KTON issued) at 17.
const STACK_LENGTH = 34;
const STACK_TOTAL_BALANCE = 2;
const STACK_SUPPLY = 17;

// Same variable as the Hipo adaptor: without a key Toncenter allows one
// request per second.
const apiKey = process.env.TONCENTER_API_KEY;
const requestOptions = {
  timeout: 30000,
  maxRedirects: 0,
  headers: apiKey ? { 'X-API-Key': apiKey } : {},
};
const pause = () =>
  apiKey ? undefined : new Promise((resolve) => setTimeout(resolve, 1100));

const toncenter = async (method, params) => {
  await pause();
  const { data } = await axios.get(`https://toncenter.com/api/v2/${method}`, {
    ...requestOptions,
    params,
  });
  if (!data.ok) throw new Error(`${method}: ${JSON.stringify(data)}`);
  return data.result;
};

// The pool's state at a masterchain block (or now, without one).
const poolState = async (seqno) => {
  await pause();
  const { data } = await axios.post(
    'https://toncenter.com/api/v2/runGetMethod',
    {
      address: POOL,
      method: 'get_pool_full_data',
      stack: [],
      ...(seqno ? { seqno } : {}),
    },
    requestOptions
  );
  const result = data.result;
  if (!data.ok || result.exit_code !== 0) {
    throw new Error('get_pool_full_data failed: ' + JSON.stringify(data));
  }
  if (result.stack.length !== STACK_LENGTH) {
    throw new Error(
      `Expected ${STACK_LENGTH} values from get_pool_full_data, got ${result.stack.length}`
    );
  }
  const totalBalance = Number(BigInt(result.stack[STACK_TOTAL_BALANCE][1]));
  const supply = Number(BigInt(result.stack[STACK_SUPPLY][1]));
  if (!(totalBalance > 0) || !(supply > 0)) {
    throw new Error('Invalid pool state: ' + totalBalance + '/' + supply);
  }
  return { totalBalance, rate: totalBalance / supply };
};

const masterchainBlock = async (unixtime) => {
  const { seqno } = await toncenter('lookupBlock', {
    workchain: -1,
    shard: '-9223372036854775808',
    unixtime,
  });
  const header = await toncenter('getBlockHeader', {
    workchain: -1,
    shard: '-9223372036854775808',
    seqno,
  });
  return { seqno, time: header.gen_utime };
};

const apy = async () => {
  const now = Math.floor(Date.now() / 1000);
  const then = await masterchainBlock(now - WINDOW);
  const before = await poolState(then.seqno);
  const current = await poolState();

  // KTON's share price: Gram per KTON, net of the protocol fee.
  const apyBase =
    (Math.pow(current.rate / before.rate, YEAR / (now - then.time)) - 1) * 100;

  const prices = await utils.getPriceApiCoins(['coingecko:the-open-network']);
  const tonPrice = prices['coingecko:the-open-network']?.price;
  if (!tonPrice) throw new Error('No TON price');

  return [
    {
      pool: `${KTON}-ton`.toLowerCase(),
      chain: utils.formatChain('ton'),
      project: 'kton',
      symbol: 'KTON',
      tvlUsd: (current.totalBalance / 1e9) * tonPrice,
      apyBase,
      // Gram per KTON: the pool's total balance over the KTON issued.
      pricePerShare: current.rate,
      underlyingTokens: ['EQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAM9c'], // native TON
      token: KTON,
    },
  ];
};

module.exports = {
  protocolId: '6139',
  timetravel: false,
  apy,
  url: 'https://app.kton.io',
};
