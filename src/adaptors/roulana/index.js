const axios = require('axios');

// Roulana (https://roulana.com): one live European roulette table on Solana. Its bank is a USDC pool held by the
// table's program (https://github.com/roulana/program): investors buy shares, the bank takes the other side of every
// bet and pays the table's 1% fee out of its edge, and a share's value moves with the bank's result. Program
// 7FqVwLDtBPC1YsKpiXUw8HxCJP63hqQKGFcnYXgYgHBn, Table account AfyXCSmsshBZ998TCCNbuUSB5hcw4RnJFeEk1LWhh63J; the vault
// BPJmrTZFCBi4iK6bA4FxV43wM1qQqiHXBGMHbfd4aw56 holds the bank together with the players' own safes, so tvlUsd is the
// bank alone (the pool).
//
// Solana keeps no past state to read a share's value 24 hours or 7 days ago, so the value comes from the table's
// public bank record (https://roulana.com/api/bank, documented at https://roulana.com/developers): the pool and the
// share value now, read from the program's Table account, and the share value each hour since the bank opened.
const API = 'https://roulana.com/api/bank';
const USDC = 'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v';
const DAY = 24 * 3600 * 1000;

// a number the record really holds (a number or a numeric string, at least `least`): anything else stops the run, so
// a missing measurement is never submitted as a zero
const measured = (x, what, least) => {
  const n =
    typeof x === 'number'
      ? x
      : typeof x === 'string' && x.trim() !== ''
      ? Number(x)
      : NaN;
  if (!Number.isFinite(n) || n < least)
    throw new Error(`roulana: no ${what} in the bank record`);
  return n;
};

// the last hourly point no later than `at` (points without a value are left out)
const pointAt = (points, at) => {
  let found = null;
  for (const p of points)
    if (
      p &&
      Number.isFinite(p.at) &&
      Number.isFinite(p.value) &&
      p.value > 0 &&
      p.at <= at &&
      (!found || p.at > found.at)
    )
      found = p;
  return found;
};

// the change of the share value since `p`, as a yearly rate over the time that really passed
const yearly = (now, p, at) =>
  p ? (now / p.value - 1) * ((365 * DAY) / (at - p.at)) * 100 : null;

const apy = async () => {
  const { data } = await axios.get(API, { timeout: 30000 });
  const now = measured(data.now?.shareValue, 'share value', Number.MIN_VALUE);
  const tvlUsd = measured(data.now?.pool, 'pool', 0);
  if (typeof data.vault !== 'string' || !data.vault)
    throw new Error('roulana: no vault in the bank record');
  const points = Array.isArray(data.history?.shareValue)
    ? data.history.shareValue
    : [];
  const at = data.readAt ?? Date.now();
  // A bank's result swings with the players' wins and losses, so one day says little: the rate is the last 7 days'
  // change of the share value, as a yearly rate. A single day after the players won would be below zero, which the
  // server turns into 0, and a lucky day would read far higher than the bank earns.
  const apyBase7d = yearly(now, pointAt(points, at - 7 * DAY), at);
  const apyBase = apyBase7d;
  return [
    {
      pool: `${data.vault}-solana`,
      chain: 'Solana',
      project: 'roulana',
      symbol: 'USDC',
      tvlUsd,
      apyBase,
      apyBase7d,
      pricePerShare: now,
      underlyingTokens: [USDC],
      poolMeta: 'Roulette table bank',
      url: 'https://roulana.com/bank',
    },
  ];
};

module.exports = {
  protocolId: '9374',
  timetravel: false,
  apy,
  url: 'https://roulana.com/bank',
};
