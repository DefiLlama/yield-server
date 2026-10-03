const axios = require('axios');
const utils = require('../utils');

// Reflect Tranches: senior + junior tranches over yield-bearing stablecoins.
//
// Per market:
//   base       = the underlying stablecoin's own yield, measured from its exchange rate over a
//                30-day window (long enough that short-term price wobble doesn't get amplified by
//                annualisation). Where the underlying exposes an on-chain exchange rate we read it
//                directly; otherwise we use DefiLlama's price history for the same quantity.
//   incentives = extra underlying airdropped into the SENIOR vault by Reflect's incentive campaign
//                (committed, funded monthly), measured on-chain from the distributor's transfers.
// The senior's interest (base + incentives) is split by the on-chain fee: senior holders keep
// (1 - fee); the fee share is routed to the junior, so the junior is leveraged on the senior:
//   seniorApy = (base + airdropApy) * (1 - fee)
//   juniorApy = base * leverage + airdropApy * (leverage - 1),  leverage = 1 + fee * seniorTvl/juniorTvl
// i.e. the junior earns base on its own capital plus the fee share of the senior's interest.
// apyBase = organic portion; apyReward = incentive portion (rewardTokens = the underlying).
const RPC = process.env.SOLANA_RPC || 'https://api.mainnet-beta.solana.com';
const DISTRIBUTOR = 'SnR6nnALuz5VTw1uxuhXYVz4RbhEHSsk13JKvF5Fsbi'; // shared incentive distributor (all markets)
const URL = 'https://tranches.reflect.money';
const BASE_WINDOW_DAYS = 30; // lookback for the underlying's own yield (smooths short-term noise)
const REWARD_WINDOW_DAYS = 2; // trailing window over which the incentive inflow is averaged
const REWARD_SAMPLE = 120; // distributor transfers sampled within that window to estimate the rate

// Hylo's hyUSD (the asset eHYUSD is a yield-bearing claim on) and eHYUSD's issuer-held hyUSD reserve.
const HYUSD_MINT = '5YMkXAYccHSGnHn9nob9xEvv6Pvka9DZWH7nTbotTu9E';
const EHYUSD_HYUSD_RESERVE = 'EqozKyMj7FVnLHc2cJj3VC25aBr4AhVh1cGM2WDajGe9';

// A JSON-RPC error arrives as HTTP 200 with `error` set, so axios won't throw on it.
const rpc = (method, params) =>
  utils.withRetry(
    async () => {
      const { data } = await axios.post(RPC, { jsonrpc: '2.0', id: 1, method, params });
      if (data.error) throw new Error(`${method}: ${data.error.message}`);
      return data.result;
    },
    { retries: 5 }
  );

// Add a new market by appending an entry. `onchainRate(hyusdPrice)` is optional: when present it
// returns the underlying's current USD price from its on-chain exchange rate; otherwise the current
// DefiLlama price is used. (syrupUSDC is CCIP-bridged, so it has no native Solana NAV to read; its
// rate on Solana is a market price equal to DefiLlama's, so we use DefiLlama for it.)
const MARKETS = [
  {
    symbol: 'syrupUSDC',
    underlying: 'AvZZF1YaZDziPY2RCK4oJrRVrbN3mTD9NL24hPeaZeUj',
    senior: 'FD4YydhzPpSmXwnHsX1oJBE4er4m9mg4ezaBN9cXgQbz',
    junior: '5dVxqyK1m3f4ZiPjZEhwgTLH5wZrU79d4Bsd67pgQk46',
  },
  {
    symbol: 'eHYUSD',
    underlying: 'HnnGv3HrSqjRpgdFmx7vQGjntNEoex1SU4e9Lxcxuihz',
    senior: 'DHEFndu3LxDkuQSzxz5HQ1N2UEm2c6evRzRSsyLL8S7i',
    junior: 'GtMx2AbDG4HgSwD4biU3PB73fWDkX8kYx1yX44RRZvLq',
    // eHYUSD (Hylo) is a yield-bearing claim on hyUSD: rate = issuer hyUSD reserve / eHYUSD supply.
    onchainRate: async (hyusdPrice) => {
      const [supply, reserve] = await Promise.all([
        rpc('getTokenSupply', ['HnnGv3HrSqjRpgdFmx7vQGjntNEoex1SU4e9Lxcxuihz']),
        rpc('getTokenAccountBalance', [EHYUSD_HYUSD_RESERVE]),
      ]);
      const perHyusd = Number(reserve.value.amount) / Number(supply.value.amount);
      return perHyusd * hyusdPrice; // eHYUSD -> hyUSD -> USD
    },
  },
  {
    symbol: 'PRIME',
    underlying: '3b8X44fLF9ooXaUm3hhSgjpmVs6rZZ3pPoGnGahc3Uu7',
    senior: 'By42A3QzVt1KERdnJcPESGWR3YoN2GSbzZroQFGJ6Qjm',
    junior: 'AAyszkQtxXEgFPwq6E19TkcuyJpK9gpxofk9LZzhdE9j',
  },
];

// A token's balance (raw) held by `owner`, summed across its token accounts.
const heldToken = async (owner, mint) => {
  const res = await rpc('getTokenAccountsByOwner', [owner, { mint }, { encoding: 'jsonParsed' }]);
  return (res?.value || []).reduce((s, a) => s + Number(a.account.data.parsed.info.tokenAmount.amount), 0);
};

// Sample the shared distributor over the trailing window and return annualised inflow per
// `${owner}|${mint}` (raw). The distributor sends every market's underlying to its senior vault,
// so one scan covers all markets. Averaging over a multi-day window keeps the incentive APR stable
// even though individual airdrops land in discrete lumps.
const airdropRatesPerYear = async () => {
  const cutoff = Math.floor(Date.now() / 1000) - REWARD_WINDOW_DAYS * 86400;
  let before;
  const all = [];
  for (let page = 0; page < 8; page++) {
    const sigs = await rpc('getSignaturesForAddress', [DISTRIBUTOR, { limit: 1000, ...(before && { before }) }]);
    if (!sigs || !sigs.length) break;
    for (const s of sigs) if (s.blockTime >= cutoff) all.push(s);
    before = sigs[sigs.length - 1].signature;
    if (sigs[sigs.length - 1].blockTime < cutoff) break;
  }
  const timed = all.filter((s) => s.blockTime);
  if (timed.length < 2) return {};
  const spanSec = timed[0].blockTime - timed[timed.length - 1].blockTime;
  if (!(spanSec > 0)) return {};

  const step = Math.max(1, Math.floor(all.length / REWARD_SAMPLE));
  const sample = all.filter((_, i) => i % step === 0).slice(0, REWARD_SAMPLE);
  // Fetch in small chunks rather than all at once, so we don't burst the RPC.
  const txs = [];
  for (let i = 0; i < sample.length; i += 10) {
    const chunk = await Promise.all(
      sample.slice(i, i + 10).map((s) =>
        rpc('getTransaction', [s.signature, { maxSupportedTransactionVersion: 0, encoding: 'jsonParsed' }]).catch(() => null)
      )
    );
    txs.push(...chunk);
    await new Promise((r) => setTimeout(r, 150));
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

  // Extrapolate the parsed sample to all signatures over the span, then annualise. Scaling by
  // `parsed` (not the requested sample size) keeps the estimate correct even if some fetches failed.
  const scale = (all.length / parsed / spanSec) * (365 * 24 * 60 * 60);
  const rates = {};
  for (const k of Object.keys(sampled)) rates[k] = sampled[k] * scale;
  return rates;
};

const apy = async () => {
  const rates = await airdropRatesPerYear();

  const now = Math.floor(Date.now() / 1000);
  const curKeys = [...MARKETS.map((m) => `solana:${m.underlying}`), `solana:${HYUSD_MINT}`].join(',');
  const histKeys = MARKETS.map((m) => `solana:${m.underlying}`).join(',');
  const cur = (await utils.getPriceApiData(`/prices/current/${curKeys}`)).coins;
  const hist = (await utils.getPriceApiData(`/prices/historical/${now - BASE_WINDOW_DAYS * 86400}/${histKeys}`)).coins;
  const hyusdPrice = cur[`solana:${HYUSD_MINT}`]?.price;

  const pools = [];
  for (const m of MARKETS) {
    const key = `solana:${m.underlying}`;
    const price30d = hist[key]?.price;
    const priceNow = m.onchainRate ? await m.onchainRate(hyusdPrice) : cur[key]?.price;
    if (!priceNow || !price30d) continue;

    const state = await rpc('getAccountInfo', [m.senior, { encoding: 'base64' }]);
    const fee = Buffer.from(state.value.data[0], 'base64').readUInt16LE(64) / 10000; // senior market fee (bps) at offset 64
    const [seniorRaw, juniorRaw] = await Promise.all([heldToken(m.senior, m.underlying), heldToken(m.junior, m.underlying)]);
    if (!seniorRaw) continue;

    const base = ((priceNow / price30d) ** (365 / BASE_WINDOW_DAYS) - 1) * 100;
    const airdropApy = ((rates[`${m.senior}|${m.underlying}`] || 0) / seniorRaw) * 100;
    const ratio = juniorRaw > 0 ? seniorRaw / juniorRaw : 0;
    const leverage = 1 + fee * ratio; // junior is leveraged on the senior by the fee split
    const seniorTvl = (seniorRaw / 1e6) * priceNow;
    const juniorTvl = (juniorRaw / 1e6) * priceNow;

    pools.push({
      pool: `${m.senior}-solana`, chain: 'Solana', project: 'reflect-tranches', symbol: m.symbol, poolMeta: 'Senior',
      tvlUsd: seniorTvl, apyBase: base * (1 - fee), apyReward: airdropApy * (1 - fee),
      rewardTokens: [m.underlying], underlyingTokens: [m.underlying], url: URL, isIntrinsicSource: true,
    });
    pools.push({
      pool: `${m.junior}-solana`, chain: 'Solana', project: 'reflect-tranches', symbol: m.symbol,
      poolMeta: `Junior · ${leverage.toFixed(2)}x leverage`,
      tvlUsd: juniorTvl, apyBase: base * leverage, apyReward: airdropApy * fee * ratio,
      rewardTokens: [m.underlying], underlyingTokens: [m.underlying], url: URL, isIntrinsicSource: true,
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
