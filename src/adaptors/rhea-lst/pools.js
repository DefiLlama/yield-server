const shared = require('../rhea-lend/data');
const { xrheaSnapshot, rnearSnapshot, nearApy } = require('./data');
const { value, rate } = require('./math');

const DEFAULT_CLIENT = { ...shared, diagnostic: console.warn };
const PRICE_IDS = ['token.rhealab.near', 'wrap.near'];

function quotePrice(quotes, tokenId) {
  const quote = quotes?.get?.(tokenId);
  if (
    !quote ||
    typeof quote !== 'object' ||
    typeof quote.price !== 'number' ||
    !Number.isFinite(quote.price) ||
    quote.price <= 0
  ) {
    throw new Error(`Missing ${tokenId} price`);
  }
  return quote.price;
}

function feeSchedule(exitFees) {
  return Object.entries(exitFees)
    .sort(([a], [b]) => Number(a) - Number(b))
    .map(([days, bps]) => `${days}d ${bps / 100}%`)
    .join(', ');
}

async function xrheaPool(height, quotes, client) {
  const price = quotePrice(quotes, 'token.rhealab.near');
  const snapshot = await xrheaSnapshot(height, client);
  const metadata = snapshot.metadata;

  return {
    pool: 'rhea-lst-xtoken.rhealab.near-near',
    chain: 'NEAR',
    project: 'rhea-lst',
    symbol: 'XRHEA',
    token: 'xtoken.rhealab.near',
    underlyingTokens: ['token.rhealab.near'],
    tvlUsd: value(metadata.cur_locked_token_amount, 18, price),
    apy: rate(
      metadata.reward_per_sec,
      metadata.cur_locked_token_amount,
      metadata.cur_undistributed_reward_amount
    ),
    pricePerShare: value(snapshot.virtualPrice, 8, 1),
    poolMeta:
      'RHEA staking; current reward annualization before position-dependent exit fees; ' +
      `cooldown earns no yield; exit fees: ${feeSchedule(snapshot.exitFees)}`,
    url: 'https://app.rhea.finance/stake',
  };
}

async function rnearPool(height, quotes, client) {
  const price = quotePrice(quotes, 'wrap.near');
  const [snapshot, apy] = await Promise.all([
    rnearSnapshot(height, client),
    nearApy(client),
  ]);
  const summary = snapshot.summary;

  return {
    pool: 'rhea-lst-lst.rhealab.near-near',
    chain: 'NEAR',
    project: 'rhea-lst',
    symbol: 'rNEAR',
    token: 'lst.rhealab.near',
    underlyingTokens: ['wrap.near'],
    tvlUsd: value(summary.total_staked_near_amount, 24, price),
    apy,
    pricePerShare: value(summary.ft_price, 24, 1),
    isIntrinsicSource: true,
    poolMeta:
      'NEAR liquid staking; APY source window and netting are unverified',
    url: 'https://app.rhea.finance/stake',
  };
}

async function getPools(client = DEFAULT_CLIENT) {
  const [{ height }, quotes] = await Promise.all([
    client.finalBlock(),
    client.prices(PRICE_IDS),
  ]);
  const results = await Promise.allSettled([
    xrheaPool(height, quotes, client),
    rnearPool(height, quotes, client),
  ]);
  const labels = ['xRHEA', 'rNEAR'];
  const diagnostic =
    typeof client.diagnostic === 'function' ? client.diagnostic : console.warn;
  const pools = [];

  results.forEach((result, index) => {
    if (result.status === 'fulfilled') pools.push(result.value);
    else {
      const message = result.reason?.message || String(result.reason);
      diagnostic(`rhea-lst ${labels[index]}: ${message}`);
    }
  });

  if (pools.length === 0) throw new Error('No usable RHEA staking pools');
  return pools;
}

module.exports = { getPools };
