const axios = require('axios');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const PROJECT = 'satsuma';
const CHAIN = 'citrea';

// Satsuma's analytics subgraph was deleted upstream, which silently dropped
// every Satsuma pool from this adapter. Both sources below are on-chain or
// derived from on-chain logs, so there is no indexer to go stale again.
const POOL_STATS = 'https://s33-epoch-cron.tiagopratas69.workers.dev/pool-stats';
const RPC = 'https://rpc.mainnet.citrea.xyz';

// s33 gauge system. The Voter streams weekly xSATS (symbol veSUMA, 1:1 with
// SUMA) emissions to one IchiVaultGauge per Algebra pool; depositors of that
// pool's ICHI vaults earn them. Booked under the period that just ended.
const VOTER = '0x451d2305a819b6bdb43a104b2d9cf46603135332';
const XSATS = '0x732bcf02bccb77dbe64cb64935c897eddf6805ac';
const SUMA = '0x60bf948001e7b7ea03ddaaddae048af7402e7b74';
const CTUSD = '0x8d82c4e3c936c7b5724a382a9c5a4e6eb7ab6d5d';
// SUMA/ctUSD Algebra pool, used to price SUMA (not on the coins API).
const SUMA_CTUSD_POOL = '0x298a4e0ec1af98066b79836ea99dcc2dd5437f67';

// Algebra pools carry a dynamic fee. globalState.lastFee is not usable here (it
// reads a constant across pools), so take the live value from fee().
const SELECTORS = {
  token0: '0x0dfe1681',
  token1: '0xd21220a7',
  fee: '0xddca3f43',
  symbol: '0x95d89b41',
  globalState: '0xe76c01e4',
  // Voter
  getAllGauges: '0xc946c5cc',
  ammPoolForGauge: '0xb8eba276',
  isAlive: '0x1703e5f9',
  getPeriod: '0x1ed24195',
  // IchiVaultGauge
  totalRewardByPeriod: '0xf4ae3d66',
};

const pad = (hex) => hex.replace(/^0x/, '').padStart(64, '0');
const encodeAddress = (selector, address) => `${selector}${pad(address)}`;
const encodeUintAddress = (selector, n, address) =>
  `${selector}${pad(BigInt(n).toString(16))}${pad(address)}`;

/** One JSON-RPC batch instead of a request per call. */
const ethCallBatch = async (calls) => {
  if (!calls.length) return [];
  const { data } = await axios.post(
    RPC,
    calls.map((c, i) => ({
      jsonrpc: '2.0',
      id: i,
      method: 'eth_call',
      params: [{ to: c.to, data: c.data }, 'latest'],
    }))
  );
  const byId = new Map((Array.isArray(data) ? data : []).map((r) => [r.id, r.result]));
  return calls.map((_, i) => byId.get(i) ?? null);
};

const toAddress = (word) =>
  word && word.length >= 66 ? `0x${word.slice(26, 66)}`.toLowerCase() : null;

const toNumber = (word) => (word && word !== '0x' ? Number(BigInt(word)) : null);

const toBigInt = (word) => (word && word !== '0x' ? BigInt(word) : 0n);

/** Minimal ABI-decode of a dynamic address[] return. */
const toAddressArray = (word) => {
  if (!word || word === '0x') return [];
  const body = word.slice(2);
  const offset = Number(BigInt(`0x${body.slice(0, 64)}`)) * 2;
  const len = Number(BigInt(`0x${body.slice(offset, offset + 64)}`));
  const out = [];
  for (let i = 0; i < len; i++) {
    const start = offset + 64 + i * 64;
    out.push(`0x${body.slice(start + 24, start + 64)}`.toLowerCase());
  }
  return out;
};

/** Minimal ABI-decode of a dynamic string return. */
const toSymbol = (word) => {
  if (!word || word === '0x') return null;
  const body = word.slice(2);
  try {
    const len = Number(BigInt(`0x${body.slice(64, 128)}`));
    if (!len || len > 64) return null;
    const hex = body.slice(128, 128 + len * 2);
    return Buffer.from(hex, 'hex').toString('utf8').replace(/\0/g, '') || null;
  } catch {
    return null;
  }
};

/** SUMA in USD from the SUMA/ctUSD pool's sqrtPrice (ctUSD priced by the coins API). */
const getSumaPriceUsd = async () => {
  const [globalState, token0] = await ethCallBatch([
    { to: SUMA_CTUSD_POOL, data: SELECTORS.globalState },
    { to: SUMA_CTUSD_POOL, data: SELECTORS.token0 },
  ]);
  if (!globalState || globalState === '0x') return null;
  const sqrtPriceX96 = BigInt(`0x${globalState.slice(2, 66)}`);
  const ratio = (Number(sqrtPriceX96) / 2 ** 96) ** 2; // token1 raw per token0 raw
  // SUMA has 18 decimals, ctUSD has 6.
  const sumaInCtUsd =
    toAddress(token0) === SUMA ? ratio * 1e12 : 1 / (ratio * 1e-12);

  let ctUsdPrice = 1;
  try {
    const { data } = await axios.get(
      `https://coins.llama.fi/prices/current/${CHAIN}:${CTUSD}`
    );
    ctUsdPrice = data?.coins?.[`${CHAIN}:${CTUSD}`]?.price ?? 1;
  } catch {
    // ctUSD is a stablecoin; fall back to parity.
  }
  const price = sumaInCtUsd * ctUsdPrice;
  return Number.isFinite(price) && price > 0 ? price : null;
};

/**
 * Weekly xSATS emissions per Algebra pool, keyed by pool address.
 * Uses the latest fully distributed period (current - 1), i.e. the amount the
 * gauge actually received for last week, which is the live reward rate.
 */
const getWeeklyEmissions = async () => {
  const [gaugesWord, periodWord] = await ethCallBatch([
    { to: VOTER, data: SELECTORS.getAllGauges },
    { to: VOTER, data: SELECTORS.getPeriod },
  ]);
  const gauges = toAddressArray(gaugesWord);
  const period = toBigInt(periodWord);
  if (!gauges.length || period === 0n) return {};
  const rewardPeriod = period - 1n;

  const [pools, alive, rewards] = await Promise.all([
    ethCallBatch(gauges.map((g) => ({ to: VOTER, data: encodeAddress(SELECTORS.ammPoolForGauge, g) }))),
    ethCallBatch(gauges.map((g) => ({ to: VOTER, data: encodeAddress(SELECTORS.isAlive, g) }))),
    ethCallBatch(
      gauges.map((g) => ({
        to: g,
        data: encodeUintAddress(SELECTORS.totalRewardByPeriod, rewardPeriod, XSATS),
      }))
    ),
  ]);

  const byPool = {};
  gauges.forEach((_, i) => {
    const pool = toAddress(pools[i]);
    if (!pool || pool === '0x0000000000000000000000000000000000000000') return;
    if (toBigInt(alive[i]) === 0n) return;
    const weekly = Number(toBigInt(rewards[i])) / 1e18;
    byPool[pool] = (byPool[pool] ?? 0) + weekly;
  });
  return byPool;
};

const apy = async () => {
  const { data: stats } = await axios.get(POOL_STATS);
  const pools = Object.entries(stats?.pools ?? {}).filter(
    ([, s]) => Number(s.tvlUSD) > 0
  );
  if (!pools.length) return [];

  const addresses = pools.map(([address]) => address.toLowerCase());

  const [token0s, token1s, fees, weeklyEmissions, sumaPriceUsd] = await Promise.all([
    ethCallBatch(addresses.map((to) => ({ to, data: SELECTORS.token0 }))),
    ethCallBatch(addresses.map((to) => ({ to, data: SELECTORS.token1 }))),
    ethCallBatch(addresses.map((to) => ({ to, data: SELECTORS.fee }))),
    getWeeklyEmissions().catch(() => ({})),
    getSumaPriceUsd().catch(() => null),
  ]);

  const tokens = addresses.flatMap((_, i) => [toAddress(token0s[i]), toAddress(token1s[i])]);
  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  const symbolResults = await ethCallBatch(
    uniqueTokens.map((to) => ({ to, data: SELECTORS.symbol }))
  );
  const symbolByToken = Object.fromEntries(
    uniqueTokens.map((token, i) => [token, toSymbol(symbolResults[i])])
  );

  const result = pools
    .map(([, stat], i) => {
      const address = addresses[i];
      const token0 = toAddress(token0s[i]);
      const token1 = toAddress(token1s[i]);
      const symbol0 = symbolByToken[token0];
      const symbol1 = symbolByToken[token1];
      if (!token0 || !token1 || !symbol0 || !symbol1) return null;

      const tvlUsd = Number(stat.tvlUSD);
      const volumeUsd24h = Number(stat.volumeUSD24h) || 0;
      // fee() is in hundredths of a bip (1e6 == 100%).
      const feeRate = (toNumber(fees[i]) ?? 0) / 1e6;
      const fees24h = volumeUsd24h * feeRate;

      // Gauge emissions go to the pool's ICHI vault depositors. Measured
      // against the whole pool TVL this is a floor on what vault LPs earn.
      const weeklySuma = weeklyEmissions[address] ?? 0;
      const rewardUsdPerYear =
        sumaPriceUsd && weeklySuma > 0 ? weeklySuma * sumaPriceUsd * 52 : 0;
      const apyReward = tvlUsd > 0 && rewardUsdPerYear > 0 ? (rewardUsdPerYear / tvlUsd) * 100 : 0;

      return {
        pool: `${address}-${CHAIN}`,
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: utils.formatSymbol(`${symbol0}-${symbol1}`),
        tvlUsd,
        apyBase: tvlUsd > 0 ? (fees24h / tvlUsd) * 365 * 100 : 0,
        ...(apyReward > 0 ? { apyReward, rewardTokens: [XSATS] } : {}),
        underlyingTokens: [token0, token1],
        volumeUsd1d: volumeUsd24h,
        url: `https://www.satsuma.exchange/pool/${address}`,
      };
    })
    .filter(Boolean)
    .filter((p) => Number.isFinite(p.tvlUsd) && p.tvlUsd > 0)
    .filter((p) => utils.keepFinite(p));

  return addMerklRewardApy(result, PROJECT, (pool) => pool.pool.split(`-${CHAIN}`)[0]);
};

module.exports = {
  protocolId: '7336',
  timetravel: false,
  apy,
  url: 'https://www.satsuma.exchange/pools',
};
