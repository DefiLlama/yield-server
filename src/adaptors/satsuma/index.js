const axios = require('axios');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const PROJECT = 'satsuma';
const CHAIN = 'citrea';

// Satsuma's analytics subgraph was deleted upstream, which silently dropped
// every Satsuma pool from this adapter. Both sources below are on-chain or
// derived from on-chain logs, so there is no indexer to go stale again.
//
// /pool-stats returns, per Algebra pool: tvlUSD, volumeUSD24h, feesUSD24h,
// token0/token1 + decimals, and a `prices` map (USD per token) that is the
// same one used to compute tvlUSD, so vault holdings valued with it are
// consistent with the pool TVL.
const POOL_STATS = 'https://s33-epoch-cron.tiagopratas69.workers.dev/pool-stats';
const RPC = 'https://rpc.mainnet.citrea.xyz';
// Axios defaults to no timeout; bound every upstream call so apy() rejects
// instead of hanging on a stalled endpoint.
const TIMEOUT_MS = 30_000;

// s33 gauge system. The Voter streams weekly xSATS (symbol veSUMA, 1:1 with
// SUMA) emissions to one IchiVaultGauge per Algebra pool. Only depositors of
// that gauge's two ICHI vaults earn them, so emissions are published on
// separate vault records rather than on the AMM pool.
const VOTER = '0x451d2305a819b6bdb43a104b2d9cf46603135332';
const XSATS = '0x732bcf02bccb77dbe64cb64935c897eddf6805ac';
const SUMA = '0x60bf948001e7b7ea03ddaaddae048af7402e7b74';
const ZERO = '0x0000000000000000000000000000000000000000';

const SELECTORS = {
  token0: '0x0dfe1681',
  token1: '0xd21220a7',
  symbol: '0x95d89b41',
  // Voter
  getAllGauges: '0xc946c5cc',
  ammPoolForGauge: '0xb8eba276',
  isAlive: '0x1703e5f9',
  getPeriod: '0x1ed24195',
  // IchiVaultGauge
  ichiVault0: '0xd2a047b7',
  ichiVault1: '0xe85b4d7b',
  totalRewardByPeriod: '0xf4ae3d66',
  // ICHI vault
  getTotalAmounts: '0xc4a7761e',
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
    })),
    { timeout: TIMEOUT_MS }
  );
  // A JSON-RPC item can carry `error` instead of `result`. Fail loudly rather
  // than publishing a pool with partial data.
  const byId = new Map((Array.isArray(data) ? data : []).map((r) => [r.id, r]));
  return calls.map((_, i) => {
    const response = byId.get(i);
    if (!response || response.error || typeof response.result !== 'string') {
      throw new Error(
        `eth_call failed for ${calls[i].to} (${calls[i].data.slice(0, 10)}): ${
          response?.error?.message ?? 'no result'
        }`
      );
    }
    return response.result;
  });
};

const toAddress = (word) =>
  word && word.length >= 66 ? `0x${word.slice(26, 66)}`.toLowerCase() : null;

const toBigInt = (word) => (word && word !== '0x' ? BigInt(word) : 0n);

const toWord = (word, index) =>
  word && word.length >= 2 + (index + 1) * 64
    ? BigInt(`0x${word.slice(2 + index * 64, 2 + (index + 1) * 64)}`)
    : 0n;

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

const toUnits = (raw, decimals) => Number(raw) / 10 ** decimals;

/**
 * One record per live IchiVaultGauge: the gauge's two ICHI vaults, their
 * combined TVL (valued with the same prices as the pool TVL), and the xSATS
 * the gauge received for the latest fully distributed period (current - 1),
 * which is the live reward rate for vault depositors.
 */
const getVaultRecords = async (poolEntries, prices) => {
  const [gaugesWord, periodWord] = await ethCallBatch([
    { to: VOTER, data: SELECTORS.getAllGauges },
    { to: VOTER, data: SELECTORS.getPeriod },
  ]);
  const gauges = toAddressArray(gaugesWord);
  const period = toBigInt(periodWord);
  if (!gauges.length || period === 0n) return [];
  const rewardPeriod = period - 1n;

  const [pools, alive, vault0s, vault1s, rewards] = await Promise.all([
    ethCallBatch(gauges.map((g) => ({ to: VOTER, data: encodeAddress(SELECTORS.ammPoolForGauge, g) }))),
    ethCallBatch(gauges.map((g) => ({ to: VOTER, data: encodeAddress(SELECTORS.isAlive, g) }))),
    ethCallBatch(gauges.map((g) => ({ to: g, data: SELECTORS.ichiVault0 }))),
    ethCallBatch(gauges.map((g) => ({ to: g, data: SELECTORS.ichiVault1 }))),
    ethCallBatch(
      gauges.map((g) => ({
        to: g,
        data: encodeUintAddress(SELECTORS.totalRewardByPeriod, rewardPeriod, XSATS),
      }))
    ),
  ]);

  const live = gauges
    .map((gauge, i) => ({
      gauge,
      pool: toAddress(pools[i]),
      vaults: [toAddress(vault0s[i]), toAddress(vault1s[i])].filter((v) => v && v !== ZERO),
      weeklySuma: toUnits(toBigInt(rewards[i]), 18),
    }))
    .filter((g) => toBigInt(alive[gauges.indexOf(g.gauge)]) !== 0n)
    .filter((g) => g.pool && g.pool !== ZERO && poolEntries[g.pool] && g.vaults.length);

  const vaultCalls = live.flatMap((g) => g.vaults.map((v) => ({ to: v, data: SELECTORS.getTotalAmounts })));
  const totals = await ethCallBatch(vaultCalls);

  const sumaPrice = prices[SUMA];
  let cursor = 0;
  return live.map((g) => {
    const entry = poolEntries[g.pool];
    const p0 = prices[entry.token0] ?? 0;
    const p1 = prices[entry.token1] ?? 0;
    let tvlUsd = 0;
    for (let k = 0; k < g.vaults.length; k++) {
      const word = totals[cursor++];
      tvlUsd +=
        toUnits(toWord(word, 0), entry.decimals0) * p0 +
        toUnits(toWord(word, 1), entry.decimals1) * p1;
    }
    const rewardUsdPerYear = sumaPrice && g.weeklySuma > 0 ? g.weeklySuma * sumaPrice * 52 : 0;
    return {
      gauge: g.gauge,
      pool: g.pool,
      tvlUsd,
      apyReward: tvlUsd > 0 && rewardUsdPerYear > 0 ? (rewardUsdPerYear / tvlUsd) * 100 : 0,
    };
  });
};

const apy = async () => {
  const { data: stats } = await axios.get(POOL_STATS, { timeout: TIMEOUT_MS });
  const prices = Object.fromEntries(
    Object.entries(stats?.prices ?? {}).map(([k, v]) => [k.toLowerCase(), Number(v)])
  );
  const poolEntries = Object.fromEntries(
    Object.entries(stats?.pools ?? {})
      .filter(([, s]) => Number(s.tvlUSD) > 0)
      .map(([address, s]) => [address.toLowerCase(), s])
  );
  const addresses = Object.keys(poolEntries);
  if (!addresses.length) return [];

  const [token0s, token1s, vaultRecords] = await Promise.all([
    ethCallBatch(addresses.map((to) => ({ to, data: SELECTORS.token0 }))),
    ethCallBatch(addresses.map((to) => ({ to, data: SELECTORS.token1 }))),
    getVaultRecords(poolEntries, prices),
  ]);

  const tokens = addresses.flatMap((_, i) => [toAddress(token0s[i]), toAddress(token1s[i])]);
  const uniqueTokens = [...new Set(tokens.filter(Boolean))];
  const symbolResults = await ethCallBatch(
    uniqueTokens.map((to) => ({ to, data: SELECTORS.symbol }))
  );
  const symbolByToken = Object.fromEntries(
    uniqueTokens.map((token, i) => [token, toSymbol(symbolResults[i])])
  );

  const poolRecords = {};
  addresses.forEach((address, i) => {
    const stat = poolEntries[address];
    const token0 = toAddress(token0s[i]);
    const token1 = toAddress(token1s[i]);
    const symbol0 = symbolByToken[token0];
    const symbol1 = symbolByToken[token1];
    if (!token0 || !token1 || !symbol0 || !symbol1) return;

    const tvlUsd = Number(stat.tvlUSD);
    const volumeUsd24h = Number(stat.volumeUSD24h) || 0;
    // Fees are accumulated per swap at the fee in force at the time (Algebra
    // pools have a dynamic fee), so use the endpoint's 24h total rather than
    // volume * current fee.
    const fees24h = Number(stat.feesUSD24h);
    if (!Number.isFinite(fees24h) || fees24h < 0) return;

    poolRecords[address] = {
      pool: `${address}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: utils.formatSymbol(`${symbol0}-${symbol1}`),
      tvlUsd,
      apyBase: tvlUsd > 0 ? (fees24h / tvlUsd) * 365 * 100 : 0,
      underlyingTokens: [token0, token1],
      volumeUsd1d: volumeUsd24h,
      url: `https://www.satsuma.exchange/pool/${address}`,
    };
  });

  // ICHI vault records. The vaults hold concentrated positions in the pool,
  // so they earn the pool's swap-fee rate on their liquidity (apyBase carried
  // over) plus the gauge's xSATS emissions (apyReward, vault-only).
  const ichiRecords = vaultRecords
    .map((v) => {
      const base = poolRecords[v.pool];
      if (!base) return null;
      return {
        ...base,
        pool: `${v.gauge}-${CHAIN}`,
        poolMeta: 'ICHI vault',
        tvlUsd: v.tvlUsd,
        ...(v.apyReward > 0 ? { apyReward: v.apyReward, rewardTokens: [XSATS] } : {}),
      };
    })
    .filter(Boolean);

  const result = [...Object.values(poolRecords), ...ichiRecords]
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
