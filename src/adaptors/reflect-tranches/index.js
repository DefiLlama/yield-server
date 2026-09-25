const axios = require('axios');
const utils = require('../utils');

// Reflect Tranches: senior + junior tranches over yield-bearing stablecoins. APY is computed from
// raw on-chain state + the underlying's own yield — no protocol API.
//
// Per market:
//   base       = the underlying's own yield, from DefiLlama's public price history.
//   incentives = extra underlying airdropped (~every minute) into the SENIOR vault by the shared
//                distributor, measured on-chain from its recent transfers.
// The senior vault's interest (base + airdrops) is split by the on-chain fee: senior holders keep
// (1 - fee); the fee share is routed to the junior market.
//   seniorApy = (base + airdropApy) * (1 - fee)
//   juniorApy = base + (base + airdropApy) * fee * seniorTvl/juniorTvl
// apyBase = organic portion; apyReward = airdrop-driven portion (rewardTokens = the underlying).
const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const DISTRIBUTOR = 'SnR6nnALuz5VTw1uxuhXYVz4RbhEHSsk13JKvF5Fsbi'; // shared incentive distributor (all markets)
const AIRDROP_SIGS = 1000; // distributor signatures to span (~1/min => ~16h window)
const AIRDROP_SAMPLE = 20; // of those, how many to fetch to estimate average airdrop sizes
const URL = 'https://tranches.reflect.money';

// Add a new market by appending an entry.
const MARKETS = [
  { symbol: 'syrupUSDC', underlying: 'AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj', senior: 'FD4YydhzPpSmXwnHsX1oJBE4er4m9mg4ezaBN9cXgQbz', junior: '5dVxqyK1m3f4ZiPjZEhwgTLH5wZrU79d4Bsd67pgQk46' },
  { symbol: 'eHYUSD', underlying: 'HnnGv3HrSqjRpgdFmx7vQGjntNEoex1SU4e9Lxcxuihz', senior: 'DHEFndu3LxDkuQSzxz5HQ1N2UEm2c6evRzRSsyLL8S7i', junior: 'GtMx2AbDG4HgSwD4biU3PB73fWDkX8kYx1yX44RRZvLq' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// JSON-RPC call with backoff on rate-limit / transient errors. Public RPCs (used when
// SOLANA_RPC is unset, e.g. in CI) throttle bursts with 429s, so retry rather than fail.
const rpc = async (method, params, tries = 6) => {
  for (let i = 0; ; i++) {
    try {
      const { data } = await axios.post(RPC, { jsonrpc: '2.0', id: 1, method, params });
      if (data.error) throw new Error(data.error.message);
      return data.result;
    } catch (e) {
      const status = e.response?.status;
      const retryable = !status || status === 429 || status >= 500;
      if (i >= tries - 1 || !retryable) throw e;
      await sleep(500 * 2 ** i); // 0.5s, 1s, 2s, 4s, 8s
    }
  }
};

// A token's balance (raw) held by `owner`, summed across its token accounts.
const heldToken = async (owner, mint) => {
  const res = await rpc('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed' }]);
  return (res?.value || []).reduce((s, a) => s + Number(a.account.data.parsed.info.tokenAmount.amount), 0);
};

// Sample the shared distributor once and return annualised inflow per `${owner}|${mint}` (raw).
// The distributor sends every market's underlying to its senior vault, so one scan covers all markets.
const airdropRatesPerYear = async () => {
  const sigs = await rpc('getSignaturesForAddress', [DISTRIBUTOR, { limit: AIRDROP_SIGS }]);
  if (!sigs || sigs.length < 2) return {};
  const timed = sigs.filter((s) => s.blockTime);
  const spanSec = timed[0].blockTime - timed[timed.length - 1].blockTime;
  if (!(spanSec > 0)) return {};

  const step = Math.max(1, Math.floor(sigs.length / AIRDROP_SAMPLE));
  const sample = sigs.filter((_, i) => i % step === 0).slice(0, AIRDROP_SAMPLE);
  // Fetch in small chunks rather than all at once, so we don't burst the RPC.
  const txs = [];
  for (let i = 0; i < sample.length; i += 5) {
    const chunk = await Promise.all(
      sample.slice(i, i + 5).map((s) =>
        rpc('getTransaction', [s.signature, { maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' }]).catch(() => null)
      )
    );
    txs.push(...chunk);
    await sleep(150);
  }

  const sampled = {}; // `${owner}|${mint}` -> summed positive delta across parsed txs
  let parsed = 0; // count of successfully fetched txs (extrapolation denominator)
  for (const tx of txs) {
    if (!tx?.meta) continue;
    parsed += 1;
    const pre = tx.meta.preTokenBalances || [];
    for (const pb of tx.meta.postTokenBalances || []) {
      const p = pre.find((x) => x.accountIndex === pb.accountIndex);
      const delta = Number(pb.uiTokenAmount.amount) - Number(p?.uiTokenAmount.amount || 0);
      if (delta > 0) {
        const k = `${pb.owner}|${pb.mint}`;
        sampled[k] = (sampled[k] || 0) + delta;
      }
    }
  }
  if (!parsed) return {};

  // Extrapolate the parsed sample to all signatures over the span, then annualise.
  // Scaling by `parsed` (not the requested sample size) keeps the estimate correct even if
  // some getTransaction calls failed.
  const scale = (sigs.length / parsed / spanSec) * (365 * 24 * 60 * 60);
  const rates = {};
  for (const k of Object.keys(sampled)) rates[k] = sampled[k] * scale;
  return rates;
};

const apy = async () => {
  const rates = await airdropRatesPerYear();

  const keys = MARKETS.map((m) => `solana:${m.underlying}`).join(',');
  const now = Math.floor(Date.now() / 1000);
  const cur = (await utils.getPriceApiData(`/prices/current/${keys}`)).coins;
  const hist = (await utils.getPriceApiData(`/prices/historical/${now - 7 * 86400}/${keys}`)).coins;

  const pools = [];
  for (const m of MARKETS) {
    const key = `solana:${m.underlying}`;
    const priceNow = cur[key]?.price;
    const price7d = hist[key]?.price;
    if (!priceNow || !price7d) continue;

    const info = await rpc('getAccountInfo', [m.senior, { encoding: 'base64' }]);
    const fee = Buffer.from(info.value.data[0], 'base64').readUInt16LE(64) / 10000; // senior market fee (bps) at offset 64
    const [seniorRaw, juniorRaw] = await Promise.all([heldToken(m.senior, m.underlying), heldToken(m.junior, m.underlying)]);
    if (!seniorRaw) continue;

    const base = ((priceNow / price7d) ** (365 / 7) - 1) * 100;
    const airdropApy = ((rates[`${m.senior}|${m.underlying}`] || 0) / seniorRaw) * 100;
    const ratio = juniorRaw > 0 ? seniorRaw / juniorRaw : 0;
    const seniorTvl = (seniorRaw / 1e6) * priceNow;
    const juniorTvl = (juniorRaw / 1e6) * priceNow;

    pools.push({
      pool: `${m.senior}-solana`, chain: 'Solana', project: 'reflect-tranches', symbol: m.symbol, poolMeta: 'Senior',
      tvlUsd: seniorTvl, apyBase: base * (1 - fee), apyReward: airdropApy * (1 - fee),
      rewardTokens: [m.underlying], underlyingTokens: [m.underlying], url: URL,
    });
    pools.push({
      pool: `${m.junior}-solana`, chain: 'Solana', project: 'reflect-tranches', symbol: m.symbol, poolMeta: 'Junior',
      tvlUsd: juniorTvl, apyBase: base + base * fee * ratio, apyReward: airdropApy * fee * ratio,
      rewardTokens: [m.underlying], underlyingTokens: [m.underlying], url: URL,
    });
  }

  return pools.filter((p) => Number.isFinite(p.tvlUsd) && Number.isFinite(p.apyBase) && Number.isFinite(p.apyReward));
};

module.exports = {
  timetravel: false,
  protocolId: '8555',
  apy,
  url: URL,
};
