const axios = require('axios');
const utils = require('../utils');
const { addMerklRewardApy } = require('../merkl/merkl-additional-reward');
const { merklGet } = require('../merkl/merkl-client');

const PROJECT = 'brownfi-clamm';
const CHAIN = 'hemi';
// Merkl lists BrownFi CLAMM campaigns under this protocol id.
const MERKL_PROTOCOL_ID = 'brownfi';
const MERKL_CHAIN_ID = 43111;

// BrownFi CLAMM is an Algebra Integral (v1.2.2) deployment on Hemi. Its
// subgraph needs a Graph API key, so everything here is read from the public
// Hemi RPC and priced with coins.llama.fi.
const RPC = 'https://rpc.hemi.network/rpc';
const TIMEOUT_MS = 30_000;
// The public RPC rejects requests without a User-Agent.
const HEADERS = { 'User-Agent': 'defillama-yield-server', 'Content-Type': 'application/json' };

const FACTORY = '0x10253594a832f967994b44f33411940533302acb';
const FACTORY_FROM_BLOCK = 4_904_397;

// Hemi produces a block every 12s, so ~7_200 blocks per day. The actual
// elapsed time is read from block timestamps when annualising.
const BLOCKS_PER_DAY = 7_200;
// Kept well under typical provider limits; the Hemi RPC accepts larger ranges.
const LOG_CHUNK = 2_000;
const FACTORY_LOG_CHUNK = 500_000;

const TOPICS = {
  // Algebra factory: Pool(address indexed token0, address indexed token1, address pool)
  pool: '0x91ccaa7a278130b65168c3a0c8d3bcae84cf5e43704342bd3ec0b59e59c036db',
  // Uniswap-V3-shaped Swap emitted by Algebra Integral pools.
  swap: '0xc42079f94a6350d7e6235f29174924f928cc2ac818eb64fed8004e115fbcca67',
  // SwapFee(address indexed sender, uint24 overrideFee, uint24 pluginFee),
  // emitted by the pool right before every Swap.
  swapFee: '0x9443903d84c9719611bd4bba871daaf18a3950d00d5d78b1a2fa701f76df54ff',
};

// globalState.communityFee is in 1/1000; swap fees are in ppm.
const COMMUNITY_FEE_DENOMINATOR = 1_000;
const FEE_DENOMINATOR = 1_000_000;
// A token without a coins.llama.fi price is valued off a BrownFi pool that
// pairs it with a priced token, only if that side is deep enough.
const MIN_ANCHOR_USD = 1_000;
const MIN_TVL_USD = 100;

const SELECTORS = {
  token0: '0x0dfe1681',
  token1: '0xd21220a7',
  symbol: '0x95d89b41',
  decimals: '0x313ce567',
  balanceOf: '0x70a08231',
  // (price, tick, lastFee, pluginConfig, communityFee, unlocked)
  globalState: '0xe76c01e4',
  // Current swap fee in ppm as returned by the dynamic-fee plugin.
  fee: '0xddca3f43',
};

const pad = (hex) => hex.replace(/^0x/, '').padStart(64, '0');
const encodeAddress = (selector, address) => `${selector}${pad(address)}`;
const toHex = (n) => `0x${n.toString(16)}`;

const rpcBatch = async (requests) => {
  if (!requests.length) return [];
  const { data } = await axios.post(
    RPC,
    requests.map((r, i) => ({ jsonrpc: '2.0', id: i, method: r.method, params: r.params })),
    { timeout: TIMEOUT_MS, headers: HEADERS }
  );
  const byId = new Map((Array.isArray(data) ? data : []).map((r) => [r.id, r]));
  return requests.map((r, i) => {
    const response = byId.get(i);
    if (!response || response.error || response.result == null) {
      throw new Error(`${r.method} failed (${r.label}): ${response?.error?.message ?? 'no result'}`);
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
  word && word.length >= 66 ? `0x${word.slice(-40)}`.toLowerCase() : null;
const toBigInt = (word) => (word && word !== '0x' ? BigInt(word) : 0n);
const toWord = (word, index) =>
  word && word.length >= 2 + (index + 1) * 64
    ? BigInt(`0x${word.slice(2 + index * 64, 2 + (index + 1) * 64)}`)
    : 0n;
const toSignedWord = (word, index) => BigInt.asIntN(256, toWord(word, index));

const toSymbol = (word) => {
  if (!word || word === '0x') return null;
  const body = word.slice(2);
  try {
    const len = Number(BigInt(`0x${body.slice(64, 128)}`));
    if (!len || len > 64) return null;
    return Buffer.from(body.slice(128, 128 + len * 2), 'hex').toString('utf8').replace(/\0/g, '') || null;
  } catch {
    return null;
  }
};

const toUnits = (raw, decimals) => Number(raw) / 10 ** decimals;

const spotToken1PerToken0 = (sqrtPriceX96, decimals0, decimals1) => {
  const sqrt = Number(sqrtPriceX96) / 2 ** 96;
  return sqrt * sqrt * 10 ** (decimals0 - decimals1);
};

const getLogsChunked = async (filter, fromBlock, toBlock, chunk) => {
  const requests = [];
  for (let start = fromBlock; start <= toBlock; start += chunk) {
    const end = Math.min(start + chunk - 1, toBlock);
    requests.push({
      method: 'eth_getLogs',
      params: [{ ...filter, fromBlock: toHex(start), toBlock: toHex(end) }],
      label: `logs ${start}-${end}`,
    });
  }
  return (await rpcBatch(requests)).flat();
};

/** Every pool the factory has created, from its Pool events. */
const getPoolAddresses = async (head) => {
  const logs = await getLogsChunked(
    { address: FACTORY, topics: [TOPICS.pool] },
    FACTORY_FROM_BLOCK,
    head,
    FACTORY_LOG_CHUNK
  );
  return [...new Set(logs.map((l) => toAddress(l.data)))];
};

const getPoolState = async (addresses) => {
  const [token0s, token1s, states, fees] = await Promise.all([
    ethCallBatch(addresses.map((to) => ({ to, data: SELECTORS.token0 }))),
    ethCallBatch(addresses.map((to) => ({ to, data: SELECTORS.token1 }))),
    ethCallBatch(addresses.map((to) => ({ to, data: SELECTORS.globalState }))),
    ethCallBatch(addresses.map((to) => ({ to, data: SELECTORS.fee }))),
  ]);
  const pools = addresses.map((address, i) => ({
    address,
    token0: toAddress(token0s[i]),
    token1: toAddress(token1s[i]),
    sqrtPriceX96: toWord(states[i], 0),
    lastFee: Number(toWord(states[i], 2)),
    currentFee: Number(toBigInt(fees[i])),
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

/** coins.llama.fi prices, plus pool-anchored prices for tokens it lacks. */
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
 * 24h volume and LP fees per pool from Swap logs. Algebra Integral charges
 * overrideFee + pluginFee when the plugin sets an override, else the pool's
 * lastFee + pluginFee. The community share (90% on BrownFi at launch) and the
 * plugin share are removed so only what LPs receive counts towards apyBase.
 */
const getSwapStats = async (pools, prices, head) => {
  const fromBlock = head - BLOCKS_PER_DAY + 1;
  const [headBlock, startBlock] = await rpcBatch([
    { method: 'eth_getBlockByNumber', params: [toHex(head), false], label: 'head block' },
    { method: 'eth_getBlockByNumber', params: [toHex(fromBlock), false], label: 'start block' },
  ]);
  const elapsedSeconds = Number(headBlock.timestamp) - Number(startBlock.timestamp);

  const logs = await getLogsChunked(
    { address: pools.map((p) => p.address), topics: [[TOPICS.swap, TOPICS.swapFee]] },
    fromBlock,
    head,
    LOG_CHUNK
  );

  const feeByLog = new Map(
    logs
      .filter((l) => l.topics[0] === TOPICS.swapFee)
      .map((l) => [
        `${l.transactionHash}:${Number(l.logIndex)}`,
        { overrideFee: Number(toWord(l.data, 0)), pluginFee: Number(toWord(l.data, 1)) },
      ])
  );
  const poolByAddress = Object.fromEntries(pools.map((p) => [p.address, p]));
  const stats = Object.fromEntries(pools.map((p) => [p.address, { volumeUsd: 0, lpFeesUsd: 0 }]));

  for (const log of logs) {
    if (log.topics[0] !== TOPICS.swap) continue;
    const pool = poolByAddress[log.address.toLowerCase()];
    if (!pool) continue;
    const feeLog = feeByLog.get(`${log.transactionHash}:${Number(log.logIndex) - 1}`);
    if (!feeLog) {
      throw new Error(`no fee event for swap ${log.transactionHash}:${Number(log.logIndex)}`);
    }
    const { overrideFee, pluginFee } = feeLog;
    const totalFee = (overrideFee !== 0 ? overrideFee : pool.lastFee) + pluginFee;
    if (!(totalFee > 0)) continue;
    // Positive amount = paid into the pool; the fee is charged on the input.
    const amount0 = toSignedWord(log.data, 0);
    const amount1 = toSignedWord(log.data, 1);
    const inputUsd =
      amount0 > 0n
        ? toUnits(amount0, pool.decimals0) * prices[pool.token0]
        : toUnits(amount1, pool.decimals1) * prices[pool.token1];
    if (!Number.isFinite(inputUsd)) continue;
    const feeUsd = inputUsd * (totalFee / FEE_DENOMINATOR);
    const afterCommunity = feeUsd * (1 - pool.communityFee);
    stats[pool.address].volumeUsd += inputUsd;
    stats[pool.address].lpFeesUsd += afterCommunity * (1 - pluginFee / totalFee);
  }
  return { stats, elapsedSeconds };
};

const formatFee = (ppm) => `${Number((ppm / 1e4).toFixed(4))}%`;

const apy = async () => {
  const head = Number((await rpcBatch([{ method: 'eth_blockNumber', params: [], label: 'head' }]))[0]);
  const addresses = await getPoolAddresses(head);
  const { pools: allPools, tokens } = await getPoolState(addresses);
  const prices = await getPrices(allPools, tokens);
  const pools = allPools.filter(
    (p) => p.symbol0 && p.symbol1 && prices[p.token0] > 0 && prices[p.token1] > 0
  );
  const { stats, elapsedSeconds } = await getSwapStats(pools, prices, head);
  const periodsPerYear = (365 * 86_400) / elapsedSeconds;

  const result = pools
    .map((p) => {
      const tvlUsd = p.reserve0 * prices[p.token0] + p.reserve1 * prices[p.token1];
      const { volumeUsd, lpFeesUsd } = stats[p.address];
      return {
        pool: `${p.address}-${CHAIN}`,
        chain: utils.formatChain(CHAIN),
        project: PROJECT,
        symbol: utils.formatSymbol(`${p.symbol0}-${p.symbol1}`),
        tvlUsd,
        apyBase: tvlUsd > 0 ? (lpFeesUsd / tvlUsd) * periodsPerYear * 100 : 0,
        underlyingTokens: [p.token0, p.token1],
        // Algebra dynamic fee: report the plugin's current swap fee.
        poolMeta: `${formatFee(p.currentFee)} dynamic fee`,
        volumeUsd1d: volumeUsd * (86_400 / elapsedSeconds),
        url: `https://app.brownfi.io/clamm/pool/${p.address}`,
      };
    })
    .filter((p) => Number.isFinite(p.tvlUsd) && p.tvlUsd >= MIN_TVL_USD)
    .filter((p) => utils.keepFinite(p));

  const withRewards = await addMerklRewardApy(
    result,
    MERKL_PROTOCOL_ID,
    (pool) => pool.pool.split(`-${CHAIN}`)[0]
  );
  const merklUrls = await getMerklUrls();
  // The pool schema has a single `url`. Pools earning Merkl incentives link to
  // their Merkl opportunity, which shows the campaign behind apyReward and
  // links on to BrownFi for the deposit; other pools keep the BrownFi page.
  return withRewards.map((p) => {
    const merklUrl = merklUrls[p.pool.split(`-${CHAIN}`)[0]];
    if (!(p.apyReward > 0)) return p;
    const rewardTokens = [...new Set((p.rewardTokens || []).map((t) => t.toLowerCase()))];
    return { ...p, rewardTokens, ...(merklUrl ? { url: merklUrl } : {}) };
  });
};

/**
 * Merkl opportunity page per pool, built the way the Merkl adapter does
 * (chain/type/identifier). Merkl needs the checksummed identifier and the
 * opportunity type exactly as its API returns them.
 */
const getMerklUrls = async () => {
  try {
    const data = await merklGet('/v4/opportunities', {
      params: { mainProtocolId: MERKL_PROTOCOL_ID, chainId: MERKL_CHAIN_ID, status: 'LIVE', items: 100 },
    });
    return Object.fromEntries(
      (Array.isArray(data) ? data : [])
        .filter((o) => o.chainId === MERKL_CHAIN_ID && o.identifier && o.type)
        .map((o) => [
          o.identifier.toLowerCase(),
          `https://app.merkl.xyz/opportunities/${CHAIN}/${o.type}/${o.identifier}`,
        ])
    );
  } catch (err) {
    console.log(`failed to fetch Merkl opportunity urls for ${MERKL_PROTOCOL_ID}: ${err}`);
    return {};
  }
};

module.exports = {
  protocolId: '8430',
  timetravel: false,
  apy,
  url: 'https://app.brownfi.io/clamm/pool',
};
