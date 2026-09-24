const axios = require('axios');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');

const PROJECT = 'satsuma';
const CHAIN = 'citrea';

// Satsuma's analytics subgraph was deleted upstream, which silently dropped
// every Satsuma pool from this adapter. Everything below is read directly from
// Citrea (balances, swap logs, gauges) and priced with coins.llama.fi, so the
// adapter has no hosted dependency besides the RPC and DefiLlama itself.
const RPC = 'https://rpc.mainnet.citrea.xyz';
// Axios defaults to no timeout; bound every upstream call so apy() rejects
// instead of hanging on a stalled endpoint.
const TIMEOUT_MS = 30_000;

// Algebra pools. Pools with a gauge are also discovered from the Voter below,
// so new gauged pools are picked up without editing this list.
const POOLS = [
  '0xb22325fe6e033c6b7cefb7bc69c9650ffdc691f9',
  '0x78de0ada441a6bfe092967bb40ce30d7c77aad2c',
  '0x172d2ab563afdaace7247a6592ee1be62e791165',
  '0x5d4b518984ae9778479ee2ea782b9925bbf17080',
  '0x3560aa7a517b3e1fb6cddf225baf2febde3cb76c',
  '0xaea5cf09209631b6a3a69d5798034e2efdbe2cc8',
  '0x8f87f74d009e18b745fe6fb59d5859911a2c3db7',
  '0xa82eee40f1c88d773c93771d5b1fac61db311945',
  '0x28457e8dea5d0a136fb30079c6ee6f20bb3d52e0',
  '0xc9319c34e709e6e9156f22e7287af3a373b6547c',
  '0x298a4e0ec1af98066b79836ea99dcc2dd5437f67',
  '0xea3fa2b0c8223b1367bdffcaa030e6a77c3c2ef0',
  '0x9ad930b091e6b7173ee85636067245b0ceddee63',
  '0x0557b48af1503d1a50f76a24938998a664fcf73f',
];

// s33 gauge system. The Voter streams weekly xSATS (symbol veSUMA) emissions
// to one IchiVaultGauge per Algebra pool. Only depositors of that gauge's two
// ICHI vaults earn them, so emissions are published on separate vault records
// rather than on the AMM pool.
const VOTER = '0x451d2305a819b6bdb43a104b2d9cf46603135332';
const XSATS = '0x732bcf02bccb77dbe64cb64935c897eddf6805ac';
const SUMA = '0x60bf948001e7b7ea03ddaaddae048af7402e7b74';
const ZERO = '0x0000000000000000000000000000000000000000';
// xSATS exits instantly to SUMA at a 50% slash (SLASHING_PENALTY 5000 / 10_000);
// full value needs a 180-day vest. Publish the minimum attainable yield.
const XSATS_EXIT_RATIO = 0.5;

// Citrea produces a block every 2s, so ~43_200 blocks per day. The actual
// elapsed time is read from block timestamps when annualising.
const BLOCKS_PER_DAY = 43_200;
// The public RPC rejects eth_getLogs ranges above 1_000 blocks.
const LOG_CHUNK = 1_000;
const LOG_BATCH = 11;

const TOPICS = {
  // Uniswap-V3-shaped Swap emitted by Satsuma's Algebra pools.
  swap: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67',
  // Emitted by the pool immediately before every Swap; first data word is the
  // fee applied to that swap in ppm. Algebra's dynamic fee changes between
  // swaps, so this is used instead of volume * current fee.
  swapFee: '0x9443903d84c9719611bd4bba871daaf18a3950d00d5d78b1a2fa701f76df54ff',
};

// Algebra community fee denominator: globalState.communityFee is in 1/1000.
const COMMUNITY_FEE_DENOMINATOR = 1_000;
const FEE_DENOMINATOR = 1_000_000;

// A token without a coins.llama.fi price is valued off the Satsuma pool that
// pairs it with a priced token, but only if that pool's priced side is deep
// enough for the spot price to mean something.
const MIN_ANCHOR_USD = 1_000;
// Dust records (a few dollars in a vault) turn a weekly emission into a
// meaningless five-digit APY; leave them out.
const MIN_TVL_USD = 100;

const SELECTORS = {
  token0: '0x0dfe1681',
  token1: '0xd21220a7',
  symbol: '0x95d89b41',
  decimals: '0x313ce567',
  balanceOf: '0x70a08231',
  // Algebra pool: (price, tick, lastFee, pluginConfig, communityFee, unlocked)
  globalState: '0xe76c01e4',
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
const toHex = (n) => `0x${n.toString(16)}`;

/**
 * One JSON-RPC batch instead of a request per call. A JSON-RPC item can carry
 * `error` instead of `result`; fail loudly rather than publishing a pool with
 * partial data.
 */
const rpcBatch = async (requests) => {
  if (!requests.length) return [];
  const { data } = await axios.post(
    RPC,
    requests.map((r, i) => ({ jsonrpc: '2.0', id: i, method: r.method, params: r.params })),
    { timeout: TIMEOUT_MS }
  );
  const byId = new Map((Array.isArray(data) ? data : []).map((r) => [r.id, r]));
  return requests.map((r, i) => {
    const response = byId.get(i);
    if (!response || response.error || response.result == null) {
      throw new Error(
        `${r.method} failed (${r.label}): ${response?.error?.message ?? 'no result'}`
      );
    }
    return response.result;
  });
};

const ethCallBatch = (calls) =>
  rpcBatch(
    calls.map((c) => ({
      method: 'eth_call',
      params: [{ to: c.to, data: c.data }, 'latest'],
      label: `${c.to} ${c.data.slice(0, 10)}`,
    }))
  );

const toAddress = (word) =>
  word && word.length >= 66 ? `0x${word.slice(26, 66)}`.toLowerCase() : null;

const toBigInt = (word) => (word && word !== '0x' ? BigInt(word) : 0n);

const toWord = (word, index) =>
  word && word.length >= 2 + (index + 1) * 64
    ? BigInt(`0x${word.slice(2 + index * 64, 2 + (index + 1) * 64)}`)
    : 0n;

const toSignedWord = (word, index) => BigInt.asIntN(256, toWord(word, index));

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

/** Human token1 per token0 from an Algebra sqrt price (Q64.96). */
const spotToken1PerToken0 = (sqrtPriceX96, decimals0, decimals1) => {
  const sqrt = Number(sqrtPriceX96) / 2 ** 96;
  return sqrt * sqrt * 10 ** (decimals0 - decimals1);
};

/** Pools from the static list plus every pool the Voter has a gauge for. */
const getGauges = async () => {
  const [gaugesWord, periodWord] = await ethCallBatch([
    { to: VOTER, data: SELECTORS.getAllGauges },
    { to: VOTER, data: SELECTORS.getPeriod },
  ]);
  const gauges = toAddressArray(gaugesWord);
  const period = toBigInt(periodWord);
  if (!gauges.length || period === 0n) return [];
  // The latest fully distributed period (current - 1) is the live reward rate.
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

  return gauges
    .map((gauge, i) => ({
      gauge,
      alive: toBigInt(alive[i]) !== 0n,
      pool: toAddress(pools[i]),
      vaults: [toAddress(vault0s[i]), toAddress(vault1s[i])].filter((v) => v && v !== ZERO),
      weeklySuma: toUnits(toBigInt(rewards[i]), 18),
    }))
    .filter((g) => g.alive && g.pool && g.pool !== ZERO && g.vaults.length);
};

/** Token pair, spot price, community fee and reserves of every pool. */
const getPoolState = async (addresses) => {
  const [token0s, token1s, states] = await Promise.all([
    ethCallBatch(addresses.map((to) => ({ to, data: SELECTORS.token0 }))),
    ethCallBatch(addresses.map((to) => ({ to, data: SELECTORS.token1 }))),
    ethCallBatch(addresses.map((to) => ({ to, data: SELECTORS.globalState }))),
  ]);
  const pools = addresses.map((address, i) => ({
    address,
    token0: toAddress(token0s[i]),
    token1: toAddress(token1s[i]),
    sqrtPriceX96: toWord(states[i], 0),
    communityFee: Number(toWord(states[i], 4)) / COMMUNITY_FEE_DENOMINATOR,
  }));

  const tokens = [...new Set(pools.flatMap((p) => [p.token0, p.token1]).filter(Boolean))];
  const [symbols, decimals, balances] = await Promise.all([
    ethCallBatch(tokens.map((to) => ({ to, data: SELECTORS.symbol }))),
    ethCallBatch(tokens.map((to) => ({ to, data: SELECTORS.decimals }))),
    ethCallBatch(
      pools.flatMap((p) => [
        { to: p.token0, data: encodeAddress(SELECTORS.balanceOf, p.address) },
        { to: p.token1, data: encodeAddress(SELECTORS.balanceOf, p.address) },
      ])
    ),
  ]);
  const tokenInfo = Object.fromEntries(
    tokens.map((t, i) => [t, { symbol: toSymbol(symbols[i]), decimals: Number(toBigInt(decimals[i])) }])
  );

  pools.forEach((p, i) => {
    p.symbol0 = tokenInfo[p.token0].symbol;
    p.symbol1 = tokenInfo[p.token1].symbol;
    p.decimals0 = tokenInfo[p.token0].decimals;
    p.decimals1 = tokenInfo[p.token1].decimals;
    p.reserve0 = toUnits(toBigInt(balances[2 * i]), p.decimals0);
    p.reserve1 = toUnits(toBigInt(balances[2 * i + 1]), p.decimals1);
  });
  return { pools, tokens };
};

/**
 * coins.llama.fi prices, plus spot-derived prices for tokens it does not list
 * (SUMA, ZNT, ...). A missing token is valued off the deepest Satsuma pool
 * that pairs it with an already-priced token, repeated so second-hop tokens
 * resolve too. Tokens that cannot be anchored stay unpriced and their pools
 * are skipped rather than published half-valued.
 */
const getPrices = async (pools, tokens) => {
  const { pricesByAddress } = await utils.getPrices(tokens, CHAIN);
  const prices = { ...pricesByAddress };

  for (let pass = 0; pass < pools.length; pass++) {
    const candidates = {};
    for (const p of pools) {
      const spot = spotToken1PerToken0(p.sqrtPriceX96, p.decimals0, p.decimals1);
      if (!(spot > 0) || !Number.isFinite(spot)) continue;
      const p0 = prices[p.token0];
      const p1 = prices[p.token1];
      if (p0 && !p1) {
        const anchorUsd = p.reserve0 * p0;
        if (anchorUsd >= MIN_ANCHOR_USD && anchorUsd > (candidates[p.token1]?.anchorUsd ?? 0)) {
          candidates[p.token1] = { price: p0 / spot, anchorUsd };
        }
      } else if (p1 && !p0) {
        const anchorUsd = p.reserve1 * p1;
        if (anchorUsd >= MIN_ANCHOR_USD && anchorUsd > (candidates[p.token0]?.anchorUsd ?? 0)) {
          candidates[p.token0] = { price: p1 * spot, anchorUsd };
        }
      }
    }
    const found = Object.entries(candidates);
    if (!found.length) break;
    for (const [token, { price }] of found) prices[token] = price;
  }
  return prices;
};

/**
 * 24h swap volume and LP fees per pool from Swap logs. Each swap's fee comes
 * from the fee event the pool emits right before it; the community fee share
 * is removed so only what LPs receive counts towards apyBase.
 */
const getSwapStats = async (pools, prices) => {
  const [head] = await rpcBatch([{ method: 'eth_blockNumber', params: [], label: 'head' }]);
  const toBlock = Number(head);
  const fromBlock = toBlock - BLOCKS_PER_DAY + 1;

  const [headBlock, startBlock] = await rpcBatch([
    { method: 'eth_getBlockByNumber', params: [toHex(toBlock), false], label: 'head block' },
    { method: 'eth_getBlockByNumber', params: [toHex(fromBlock), false], label: 'start block' },
  ]);
  const elapsedSeconds = Number(headBlock.timestamp) - Number(startBlock.timestamp);

  const address = pools.map((p) => p.address);
  const ranges = [];
  for (let start = fromBlock; start <= toBlock; start += LOG_CHUNK) {
    ranges.push([start, Math.min(start + LOG_CHUNK - 1, toBlock)]);
  }
  const logs = [];
  for (let i = 0; i < ranges.length; i += LOG_BATCH) {
    const results = await rpcBatch(
      ranges.slice(i, i + LOG_BATCH).map(([from, to]) => ({
        method: 'eth_getLogs',
        params: [
          {
            fromBlock: toHex(from),
            toBlock: toHex(to),
            address,
            topics: [[TOPICS.swap, TOPICS.swapFee]],
          },
        ],
        label: `logs ${from}-${to}`,
      }))
    );
    logs.push(...results.flat());
  }

  const feeByLog = new Map(
    logs
      .filter((l) => l.topics[0] === TOPICS.swapFee)
      .map((l) => [`${l.transactionHash}:${Number(l.logIndex)}`, Number(toWord(l.data, 0))])
  );
  const poolByAddress = Object.fromEntries(pools.map((p) => [p.address, p]));
  const stats = Object.fromEntries(pools.map((p) => [p.address, { volumeUsd: 0, lpFeesUsd: 0 }]));

  for (const log of logs) {
    if (log.topics[0] !== TOPICS.swap) continue;
    const pool = poolByAddress[log.address.toLowerCase()];
    const fee = feeByLog.get(`${log.transactionHash}:${Number(log.logIndex) - 1}`);
    if (fee === undefined) {
      throw new Error(`no fee event for swap ${log.transactionHash}:${Number(log.logIndex)}`);
    }
    // Positive amount = paid into the pool. The fee is charged on the input.
    const amount0 = toSignedWord(log.data, 0);
    const amount1 = toSignedWord(log.data, 1);
    const inputUsd =
      amount0 > 0n
        ? toUnits(amount0, pool.decimals0) * prices[pool.token0]
        : toUnits(amount1, pool.decimals1) * prices[pool.token1];
    if (!Number.isFinite(inputUsd)) continue;
    stats[pool.address].volumeUsd += inputUsd;
    stats[pool.address].lpFeesUsd +=
      inputUsd * (fee / FEE_DENOMINATOR) * (1 - pool.communityFee);
  }
  return { stats, elapsedSeconds };
};

/**
 * Liquidity each gauge's ICHI vaults hold inside the pool, valued with the
 * same prices as the pool. Idle vault balances are not in the pool's balance,
 * so they are only counted on the vault record, not subtracted from the AMM.
 */
const getVaultTvl = async (gauges, poolByAddress, prices) => {
  const vaults = gauges.flatMap((g) => g.vaults.map((v) => ({ vault: v, pool: poolByAddress[g.pool] })));
  const [totals, idle] = await Promise.all([
    ethCallBatch(vaults.map((v) => ({ to: v.vault, data: SELECTORS.getTotalAmounts }))),
    ethCallBatch(
      vaults.flatMap((v) => [
        { to: v.pool.token0, data: encodeAddress(SELECTORS.balanceOf, v.vault) },
        { to: v.pool.token1, data: encodeAddress(SELECTORS.balanceOf, v.vault) },
      ])
    ),
  ]);

  const byGauge = {};
  vaults.forEach(({ pool }, i) => {
    const gauge = gauges.find((g) => g.vaults.includes(vaults[i].vault)).gauge;
    const p0 = prices[pool.token0];
    const p1 = prices[pool.token1];
    const total0 = toUnits(toWord(totals[i], 0), pool.decimals0);
    const total1 = toUnits(toWord(totals[i], 1), pool.decimals1);
    const idle0 = toUnits(toBigInt(idle[2 * i]), pool.decimals0);
    const idle1 = toUnits(toBigInt(idle[2 * i + 1]), pool.decimals1);
    const entry = (byGauge[gauge] ??= { tvlUsd: 0, inPoolUsd: 0 });
    entry.tvlUsd += total0 * p0 + total1 * p1;
    entry.inPoolUsd += Math.max(0, total0 - idle0) * p0 + Math.max(0, total1 - idle1) * p1;
  });
  return byGauge;
};

const apy = async () => {
  const gauges = await getGauges();
  const addresses = [...new Set([...POOLS, ...gauges.map((g) => g.pool)])];

  const { pools: allPools, tokens } = await getPoolState(addresses);
  const prices = await getPrices(allPools, tokens);
  const pools = allPools.filter(
    (p) => p.symbol0 && p.symbol1 && prices[p.token0] > 0 && prices[p.token1] > 0
  );
  const poolByAddress = Object.fromEntries(pools.map((p) => [p.address, p]));
  const liveGauges = gauges.filter((g) => poolByAddress[g.pool]);

  const [{ stats, elapsedSeconds }, vaultTvl] = await Promise.all([
    getSwapStats(pools, prices),
    getVaultTvl(liveGauges, poolByAddress, prices),
  ]);
  const periodsPerYear = (365 * 86_400) / elapsedSeconds;

  const vaultInPoolUsd = {};
  for (const g of liveGauges) {
    vaultInPoolUsd[g.pool] = (vaultInPoolUsd[g.pool] ?? 0) + vaultTvl[g.gauge].inPoolUsd;
  }

  const poolApyBase = {};
  const ammRecords = pools.map((p) => {
    const poolTvlUsd = p.reserve0 * prices[p.token0] + p.reserve1 * prices[p.token1];
    const { volumeUsd, lpFeesUsd } = stats[p.address];
    // Vault and pool LPs earn the same swap-fee rate on their liquidity.
    poolApyBase[p.address] = poolTvlUsd > 0 ? (lpFeesUsd / poolTvlUsd) * periodsPerYear * 100 : 0;
    return {
      pool: `${p.address}-${CHAIN}`,
      chain: utils.formatChain(CHAIN),
      project: PROJECT,
      symbol: `${p.symbol0}-${p.symbol1}`,
      // ICHI vault liquidity sits inside the pool and is published on its own
      // record, so it is netted out here to keep the two from double counting.
      tvlUsd: Math.max(0, poolTvlUsd - (vaultInPoolUsd[p.address] ?? 0)),
      apyBase: poolApyBase[p.address],
      underlyingTokens: [p.token0, p.token1],
      volumeUsd1d: volumeUsd * (86_400 / elapsedSeconds),
      url: `https://www.satsuma.exchange/pool/${p.address}`,
    };
  });
  const ammByAddress = Object.fromEntries(ammRecords.map((r, i) => [pools[i].address, r]));

  // ICHI vault records: the pool's swap-fee rate plus the gauge's xSATS
  // emissions, valued at the instant-exit SUMA amount.
  const sumaPrice = prices[SUMA];
  const ichiRecords = liveGauges.map((g) => {
    const { tvlUsd } = vaultTvl[g.gauge];
    const rewardUsdPerYear =
      sumaPrice && g.weeklySuma > 0 ? g.weeklySuma * sumaPrice * XSATS_EXIT_RATIO * 52 : 0;
    const apyReward = tvlUsd > 0 ? (rewardUsdPerYear / tvlUsd) * 100 : 0;
    // Volume is a pool-level figure; it stays on the AMM record only.
    const { volumeUsd1d, ...base } = ammByAddress[g.pool];
    return {
      ...base,
      pool: `${g.gauge}-${CHAIN}`,
      poolMeta: 'ICHI vault',
      tvlUsd,
      ...(apyReward > 0 ? { apyReward, rewardTokens: [XSATS] } : {}),
    };
  });

  const result = [...ammRecords, ...ichiRecords]
    .filter((p) => Number.isFinite(p.tvlUsd) && p.tvlUsd >= MIN_TVL_USD)
    .filter((p) => utils.keepFinite(p));

  return addMerklRewardApy(result, PROJECT, (pool) => pool.pool.split(`-${CHAIN}`)[0]);
};

module.exports = {
  protocolId: '7336',
  timetravel: false,
  apy,
  url: 'https://www.satsuma.exchange/pools',
};
