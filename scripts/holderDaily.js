const path = require('path');
require('dotenv').config({
  path: path.resolve(__dirname, '../config.env'),
});

const sdk = require('@defillama/sdk');

const {
  fetchHolders,
  isValidEvmAddress,
  resolveChainId,
  refineHoldersOnChain,
  loadHolderCache,
  saveHolderCache,
  classifyTokensBatch,
  getAnkrTopHolders,
  HIGH_HOLDER_THRESHOLD,
} = require('../src/utils/holderApi');

const { getChainKeyFromLabel } = sdk.chainUtils;
const { getEligiblePools, insertHolder } = require('../src/queries/holder');
const { connect } = require('../src/utils/dbConnection');

// ── CLI Parsing ──────────────────────────────────────────────────────────────

function parseArgs() {
  const args = process.argv.slice(2);
  const opts = {
    tvlMin: 10000,
    batchDelay: 1000,
    date: null,
    dryRun: false,
    skipExisting: true,
    standardOnly: false,
    flaggedOnly: false,
    reseed: false,
    limit: 0,
    chain: null,
    token: null,
    pool: null,
    help: false,
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    switch (arg) {
      case '--tvl-min':
        opts.tvlMin = Number(args[++i]);
        break;
      case '--batch-delay':
        opts.batchDelay = Number(args[++i]);
        break;
      case '--date':
        opts.date = args[++i];
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--no-skip':
        opts.skipExisting = false;
        break;
      case '--standard-only':
        opts.standardOnly = true;
        break;
      case '--flagged-only':
        opts.flaggedOnly = true;
        break;
      case '--reseed':
        opts.reseed = true;
        break;
      case '--limit':
        opts.limit = Number(args[++i]);
        break;
      case '--chain':
        opts.chain = args[++i];
        break;
      case '--token':
        opts.token = args[++i]?.toLowerCase();
        break;
      case '--pool':
        opts.pool = args[++i]?.toLowerCase();
        break;
      case '--help':
        opts.help = true;
        break;
      default:
        console.error(`Unknown option: ${arg}`);
        process.exit(1);
    }
  }

  if (opts.date) {
    const d = new Date(opts.date + 'T00:00:00.000Z');
    if (isNaN(d.getTime())) {
      console.error(`Invalid date: ${opts.date}`);
      process.exit(1);
    }
    opts.targetDate = d;
  } else {
    const d = new Date();
    d.setUTCHours(0, 0, 0, 0);
    opts.targetDate = d;
  }

  return opts;
}

function printHelp() {
  console.log(`
Usage: node scripts/holderDaily.js [options]

Options:
  --tvl-min N              TVL threshold in USD (default: 10000)
  --batch-delay N          Override delay in ms between batches
  --date YYYY-MM-DD        Target date, midnight UTC (default: today)
  --dry-run                Fetch data but skip DB inserts
  --no-skip                Process all pools even if already seeded today
  --standard-only          Only process standard (rebase=false) tokens
  --flagged-only           Only process flagged (rebase) tokens
  --reseed                 Force full re-seed for all flagged pools (ignore S3 cache)
  --chain NAME             Only process pools on this chain
  --token ADDRESS          Only process a single token address
  --pool POOL_ID           Only process a single pool by pool ID
  --limit N                Cap total pools processed
  --help                   Show this help

Environment:
  DATABASE_URL                Required — PostgreSQL connection
  LLAMA_INDEXER_V2_ENDPOINT   Required — Indexer base URL
  LLAMA_INDEXER_V2_API_KEY    Required — Indexer API key
  BUCKET_HOLDERS_DATA         Required — S3 bucket for holder cache
  ANKR_API_KEY                Optional — ANKR fallback (skipped if missing)

Examples:
  node scripts/holderDaily.js
  node scripts/holderDaily.js --flagged-only --reseed
  node scripts/holderDaily.js --chain ethereum --token 0x856c...
  node scripts/holderDaily.js --dry-run --limit 100
`);
}

// ── Utilities ────────────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toLocaleTimeString('en-GB', { hour12: false });
}

function log(phase, message) {
  const tag = `[${phase}]`.padEnd(16);
  console.log(`[${timestamp()}] ${tag} ${message}`);
}

function createTimer() {
  const start = Date.now();
  return {
    elapsed: () => Date.now() - start,
    stop: () => formatDuration(Date.now() - start),
  };
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  if (m < 60) return `${m}m ${rem.toFixed(1)}s`;
  const h = Math.floor(m / 60);
  return `${h}h ${m % 60}m ${Math.floor(rem)}s`;
}

function formatNumber(n) {
  return n.toLocaleString();
}

function createStats() {
  return {
    discovery: { poolsFromDb: 0, filteredOut: 0, validEvm: 0, skippedExisting: 0 },
    standard: { total: 0, success: 0, failed: 0, skipped: 0, timeMs: 0 },
    flagged: { total: 0, success: 0, failed: 0, skipped: 0, timeMs: 0 },
    fallback: { ankrCalls: 0, ankrSuccess: 0, ankrTimeMs: 0, onChainCalls: 0, onChainSuccess: 0, onChainTimeMs: 0 },
    db: { inserts: 0, timeMs: 0 },
    s3: { classificationSaves: 0, holderListSaves: 0, saveErrors: 0 },
    perChain: {},
  };
}

function trackChain(stats, chain, outcome) {
  if (!stats.perChain[chain]) stats.perChain[chain] = { total: 0, success: 0, failed: 0 };
  stats.perChain[chain].total++;
  if (outcome === 'success') stats.perChain[chain].success++;
  else if (outcome === 'failed') stats.perChain[chain].failed++;
}

// ── Graceful Shutdown ────────────────────────────────────────────────────────

let shuttingDown = false;
let forceCount = 0;

process.on('SIGINT', () => {
  if (forceCount > 0) {
    console.log('\nForce exit.');
    process.exit(1);
  }
  forceCount++;
  shuttingDown = true;
  log('SHUTDOWN', 'Graceful shutdown requested — completing current batch...');
  log('SHUTDOWN', 'Press Ctrl+C again to force exit.');
});

// ── Processing Functions ─────────────────────────────────────────────────────

function buildResult(
  holders,
  holderCount,
  configID,
  tvlUsd,
  totalSupplyMap,
  decimalsMap,
  chain,
  tokenAddress,
  today
) {
  if (holderCount === 0) {
    return {
      configID,
      timestamp: today.toISOString(),
      holderCount: 0,
      avgPositionUsd: null,
      top10Pct: null,
      top10Holders: null,
    };
  }

  const avgPositionUsd = tvlUsd / holderCount;
  const supplyKey = `${tokenAddress.toLowerCase()}-${chain}`;
  const totalSupply = totalSupplyMap[supplyKey];
  const decimals = decimalsMap[supplyKey] ?? null;
  let top10Pct = null;
  let top10Holders = null;

  if (totalSupply && totalSupply > 0n) {
    const top10 = holders.slice(0, 10);
    const top10Balance = top10.reduce((sum, h) => sum + h.balance, 0n);
    top10Pct = Number((top10Balance * 10000n) / totalSupply) / 100;
    top10Holders = {
      decimals,
      holders: top10.map((h) => ({
        address: h.address,
        balance: String(h.balance),
        balancePct:
          totalSupply > 0n
            ? Number((h.balance * 10000n) / totalSupply) / 100
            : 0,
      })),
    };
  }

  return {
    configID,
    timestamp: today.toISOString(),
    holderCount,
    avgPositionUsd,
    top10Pct,
    top10Holders,
  };
}

// Standard pool — Peluche rebase=false, ANKR fallback
async function processPool(task, totalSupplyMap, decimalsMap, today, stats) {
  const { configID, chain, chainId, tokenAddress, tvlUsd } = task;

  let data;
  try {
    data = await fetchHolders(chainId, tokenAddress, 10, false);
  } catch (err) {
    if (process.env.ANKR_API_KEY) {
      const t = createTimer();
      stats.fallback.ankrCalls++;
      try {
        const ankrData = await getAnkrTopHolders(tokenAddress, chain, 15);
        stats.fallback.ankrTimeMs += t.elapsed();
        if (ankrData && ankrData.holdersCount > 0) {
          stats.fallback.ankrSuccess++;
          return buildResult(ankrData.holders, ankrData.holdersCount, configID, tvlUsd, totalSupplyMap, decimalsMap, chain, tokenAddress, today);
        }
      } catch (ankrErr) {
        stats.fallback.ankrTimeMs += t.elapsed();
      }
    }
    return null;
  }

  const holderCount = data.total_holders;

  if (holderCount == null) {
    if (process.env.ANKR_API_KEY) {
      const t = createTimer();
      stats.fallback.ankrCalls++;
      try {
        const ankrData = await getAnkrTopHolders(tokenAddress, chain, 15);
        stats.fallback.ankrTimeMs += t.elapsed();
        if (ankrData && ankrData.holdersCount > 0) {
          stats.fallback.ankrSuccess++;
          return buildResult(ankrData.holders, ankrData.holdersCount, configID, tvlUsd, totalSupplyMap, decimalsMap, chain, tokenAddress, today);
        }
      } catch (ankrErr) {
        stats.fallback.ankrTimeMs += t.elapsed();
      }
    }
    return null;
  }

  if (holderCount === 0) {
    return { configID, timestamp: today.toISOString(), holderCount: 0, avgPositionUsd: null, top10Pct: null, top10Holders: null };
  }

  const avgPositionUsd = holderCount > 0 ? tvlUsd / holderCount : null;
  let top10Pct = null;
  let top10Holders = null;
  const supplyKey = `${tokenAddress.toLowerCase()}-${chain}`;
  const totalSupply = totalSupplyMap[supplyKey];
  const decimals = decimalsMap[supplyKey] ?? null;

  const topEntries = data.holders || data.deltas || [];
  if (topEntries.length > 0 && totalSupply && totalSupply > 0n) {
    const top10Balance = topEntries.reduce(
      (sum, d) => sum + BigInt(d.balance || d.delta || d.amount || 0),
      0n
    );
    top10Pct = Number((top10Balance * 10000n) / totalSupply) / 100;
    top10Holders = {
      decimals,
      holders: topEntries.map((d) => ({
        address: d.holder || d.address || d.owner,
        balance: String(d.balance || d.delta || d.amount || 0),
        balancePct:
          totalSupply > 0n
            ? Number((BigInt(d.balance || d.delta || d.amount || 0) * 10000n) / totalSupply) / 100
            : 0,
      })),
    };
  }

  return { configID, timestamp: today.toISOString(), holderCount, avgPositionUsd, top10Pct, top10Holders };
}

// On-chain balanceOf fallback for share-based / failed flagged pools
async function processShareBasedPool(task, totalSupplyMap, decimalsMap, today, stats) {
  const { configID, chain, chainId, tokenAddress, tvlUsd } = task;

  try {
    const data = await fetchHolders(chainId, tokenAddress, 100000000000, false);
    const entries = data.holders || data.deltas || [];

    if (entries.length === 0) {
      return processPool(task, totalSupplyMap, decimalsMap, today, stats);
    }

    const addresses = entries.map((d) => d.holder || d.address || d.owner).filter(Boolean);
    if (addresses.length === 0) {
      return processPool(task, totalSupplyMap, decimalsMap, today, stats);
    }

    const t = createTimer();
    stats.fallback.onChainCalls++;
    let refined;
    try {
      refined = await refineHoldersOnChain(tokenAddress, addresses, chain);
      stats.fallback.onChainTimeMs += t.elapsed();
      stats.fallback.onChainSuccess++;
    } catch (refineErr) {
      stats.fallback.onChainTimeMs += t.elapsed();
      throw refineErr;
    }

    return buildResult(refined, refined.length, configID, tvlUsd, totalSupplyMap, decimalsMap, chain, tokenAddress, today);
  } catch (err) {
    return processPool(task, totalSupplyMap, decimalsMap, today, stats);
  }
}

// Flagged pool seed — full rebase=true fetch + S3 cache save
async function seedFlaggedPool(task, totalSupplyMap, decimalsMap, today, stats) {
  const { configID, chain, chainId, tokenAddress, tvlUsd } = task;

  try {
    const preview = await fetchHolders(chainId, tokenAddress, 1, false);
    if (preview.total_holders > HIGH_HOLDER_THRESHOLD) {
      log('FLAGGED', `${tokenAddress} on ${chain}: ${formatNumber(preview.total_holders)} holders, using ANKR fallback`);
      if (process.env.ANKR_API_KEY) {
        const t = createTimer();
        stats.fallback.ankrCalls++;
        try {
          const ankrData = await getAnkrTopHolders(tokenAddress, chain, 15);
          stats.fallback.ankrTimeMs += t.elapsed();
          if (ankrData && ankrData.holders.length > 0) {
            stats.fallback.ankrSuccess++;
            return buildResult(ankrData.holders, ankrData.holdersCount, configID, tvlUsd, totalSupplyMap, decimalsMap, chain, tokenAddress, today);
          }
        } catch (ankrErr) {
          stats.fallback.ankrTimeMs += t.elapsed();
        }
      }
      log('FALLBACK', `${tokenAddress} on ${chain}: high holders, on-chain fallback (no S3 cache)`);
      return processShareBasedPool(task, totalSupplyMap, decimalsMap, today, stats);
    }

    const data = await fetchHolders(chainId, tokenAddress, 100000000000, true);
    const entries = data.holders || data.deltas || [];
    if (entries.length === 0) {
      log('FALLBACK', `${tokenAddress} on ${chain}: empty rebase=true response, standard fallback (no S3 cache)`);
      return processPool(task, totalSupplyMap, decimalsMap, today, stats);
    }

    const holders = entries
      .filter((d) => d.holder)
      .map((d) => ({ address: d.holder.toLowerCase(), balance: BigInt(d.balance || d.delta || 0) }))
      .filter((h) => h.balance > 0n)
      .sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));

    if (holders.length === 0) {
      log('FALLBACK', `${tokenAddress} on ${chain}: no valid holders after filter, standard fallback (no S3 cache)`);
      return processPool(task, totalSupplyMap, decimalsMap, today, stats);
    }

    const result = buildResult(holders, holders.length, configID, tvlUsd, totalSupplyMap, decimalsMap, chain, tokenAddress, today);

    if (process.env.BUCKET_HOLDERS_DATA) {
      result._holderCache = { tokenAddress, chain, holders, holderCount: holders.length, tokenType: task.tokenType, currentBlock: data.to_block };
    }

    return result;
  } catch (err) {
    log('FALLBACK', `${tokenAddress} on ${chain}: seed failed (${err.message}), on-chain fallback (no S3 cache)`);
    return processShareBasedPool(task, totalSupplyMap, decimalsMap, today, stats);
  }
}

const TOP_N_RECHECK = 100;

// Chains where snapshot/from_block is not yet supported — always do full seed
const NO_SNAPSHOT_CHAINS = new Set(['bsc', 'polygon', 'xdai']);

// Flagged pool incremental — daily snapshot from last cached block
// preloadedCache is optional — if provided, skips S3 read
async function processFlaggedIncremental(task, totalSupplyMap, decimalsMap, today, stats, preloadedCache) {
  const { configID, chain, chainId, tokenAddress, tvlUsd } = task;

  if (NO_SNAPSHOT_CHAINS.has(chain)) {
    return seedFlaggedPool(task, totalSupplyMap, decimalsMap, today, stats);
  }

  try {
    const cache = preloadedCache || await loadHolderCache(tokenAddress, chain);
    if (!cache || !cache.holders || cache.holders.length === 0) {
      log('INCREMENTAL', `${tokenAddress} on ${chain}: no cache → full seed`);
      return seedFlaggedPool(task, totalSupplyMap, decimalsMap, today, stats);
    }

    const data = await fetchHolders(chainId, tokenAddress, 100000000000, true, cache.lastBlock, true);
    const toBlock = data.to_block;
    const entries = data.holders || data.deltas || [];

    const holderMap = new Map();
    for (const h of cache.holders) {
      holderMap.set(h.address.toLowerCase(), BigInt(h.balance));
    }

    // Apply snapshot: balance > 0 → upsert, balance === 0 → delete
    const activeAddrs = new Set();
    for (const d of entries) {
      const addr = (d.holder || d.address || '').toLowerCase();
      if (!addr) continue;
      const bal = BigInt(d.balance || d.delta || '0');
      if (bal > 0n) {
        holderMap.set(addr, bal);
        activeAddrs.add(addr);
      } else {
        holderMap.delete(addr);
      }
    }

    // True rebase: re-verify top N cached holders via balanceOf
    if (cache.tokenType === 'true_rebase') {
      const topCached = cache.holders.slice(0, TOP_N_RECHECK).map((h) => h.address.toLowerCase());
      const toRecheck = topCached.filter((addr) => !activeAddrs.has(addr));
      if (toRecheck.length > 0) {
        const refined = await refineHoldersOnChain(tokenAddress, toRecheck, chain);
        for (const addr of toRecheck) holderMap.delete(addr);
        for (const h of refined) holderMap.set(h.address.toLowerCase(), h.balance);
      }
    }

    const holders = Array.from(holderMap.entries())
      .map(([address, balance]) => ({ address, balance }))
      .sort((a, b) => (b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0));

    const holderCount = holders.length;
    const prevCount = cache.holderCount || cache.holders.length;
    const delta = holderCount - prevCount;
    log('INCREMENTAL', `${tokenAddress} on ${chain}: ${formatNumber(holderCount)} holders (${delta >= 0 ? '+' : ''}${delta} since last)`);

    const result = buildResult(holders, holderCount, configID, tvlUsd, totalSupplyMap, decimalsMap, chain, tokenAddress, today);

    // Skip S3 save if snapshot was empty and no rebase re-verification
    const snapshotChanged = entries.length > 0 || cache.tokenType === 'true_rebase';
    if (process.env.BUCKET_HOLDERS_DATA && snapshotChanged) {
      result._holderCache = { tokenAddress, chain, holders, holderCount, tokenType: cache.tokenType, currentBlock: toBlock };
    }

    return result;
  } catch (err) {
    log('FALLBACK', `${tokenAddress} on ${chain}: incremental failed (${err.message}) → on-chain fallback`);
    return processShareBasedPool(task, totalSupplyMap, decimalsMap, today, stats);
  }
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseArgs();

  if (opts.help) {
    printHelp();
    process.exit(0);
  }

  const stats = createStats();
  const globalTimer = createTimer();

  const STANDARD_BATCH = 25;
  const FLAGGED_BATCH = 5;
  const STANDARD_DELAY = opts.batchDelay || 1000;
  const FLAGGED_DELAY = opts.batchDelay ? opts.batchDelay * 2 : 2000;

  // ── Config Banner ──
  log('HOLDER', '═══════════════════════════════════════════');
  log('CONFIG', `TVL threshold:  $${formatNumber(opts.tvlMin)}`);
  log('CONFIG', `Target date:    ${opts.targetDate.toISOString()}`);
  log('CONFIG', `Batch size:     ${STANDARD_BATCH} (standard), ${FLAGGED_BATCH} (flagged)`);
  log('CONFIG', `Batch delay:    ${STANDARD_DELAY}ms (standard), ${FLAGGED_DELAY}ms (flagged)`);
  if (opts.dryRun) log('CONFIG', `Dry run:        true`);
  if (opts.standardOnly) log('CONFIG', `Standard only:  true`);
  if (opts.flaggedOnly) log('CONFIG', `Flagged only:   true`);
  if (opts.reseed) log('CONFIG', `Reseed:         true`);
  if (opts.chain) log('CONFIG', `Chain filter:   ${opts.chain}`);
  if (opts.token) log('CONFIG', `Token filter:   ${opts.token}`);
  if (opts.pool) log('CONFIG', `Pool filter:    ${opts.pool}`);
  log('CONFIG', `DATABASE_URL:   ${process.env.DATABASE_URL ? 'set' : 'MISSING'}`);
  log('CONFIG', `INDEXER:        ${process.env.LLAMA_INDEXER_V2_ENDPOINT ? 'set' : 'MISSING'}`);
  log('CONFIG', `INDEXER_KEY:    ${process.env.LLAMA_INDEXER_V2_API_KEY ? 'set' : 'MISSING'}`);
  log('CONFIG', `S3_BUCKET:      ${process.env.BUCKET_HOLDERS_DATA ? 'set' : 'MISSING'}`);
  log('CONFIG', `ANKR_API_KEY:   ${process.env.ANKR_API_KEY ? 'set' : 'not set (fallback disabled)'}`);
  log('HOLDER', '═══════════════════════════════════════════');

  const required = ['DATABASE_URL', 'LLAMA_INDEXER_V2_ENDPOINT', 'LLAMA_INDEXER_V2_API_KEY', 'BUCKET_HOLDERS_DATA'];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    log('ERROR', `Missing required env vars: ${missing.join(', ')}. Set in config.env or environment.`);
    process.exit(1);
  }

  // ── Phase 1: Discovery ──

  log('DISCOVERY', 'Fetching eligible pools from DB...');
  const discoveryTimer = createTimer();
  const pools = await getEligiblePools(opts.tvlMin);
  stats.discovery.poolsFromDb = pools.length;
  log('DISCOVERY', `Found ${formatNumber(pools.length)} pools from DB`);

  const tasks = [];
  for (const pool of pools) {
    if (!pool.token || !isValidEvmAddress(pool.token)) { stats.discovery.filteredOut++; continue; }
    if (!pool.chain) { stats.discovery.filteredOut++; continue; }

    const chain = getChainKeyFromLabel(pool.chain) || pool.chain;
    const chainId = resolveChainId(chain);
    if (chainId == null) { stats.discovery.filteredOut++; continue; }

    if (opts.chain && chain !== opts.chain) { stats.discovery.filteredOut++; continue; }
    if (opts.token && pool.token.toLowerCase() !== opts.token) { stats.discovery.filteredOut++; continue; }
    if (opts.pool && pool.pool.toLowerCase() !== opts.pool) { stats.discovery.filteredOut++; continue; }

    tasks.push({ configID: pool.configID, pool: pool.pool, chain, chainId, tokenAddress: pool.token, tvlUsd: pool.tvlUsd });
  }

  stats.discovery.validEvm = tasks.length;
  log('DISCOVERY', `${formatNumber(tasks.length)} valid EVM pools (${formatNumber(stats.discovery.filteredOut)} excluded)`);

  if (opts.skipExisting) {
    const conn = await connect();
    const existing = await conn.query('SELECT "configID" FROM holder_daily WHERE timestamp = $1', [opts.targetDate.toISOString()]);
    const existingSet = new Set(existing.map((r) => r.configID));
    const beforeCount = tasks.length;
    const filtered = tasks.filter((t) => !existingSet.has(t.configID));
    stats.discovery.skippedExisting = beforeCount - filtered.length;
    tasks.length = 0;
    tasks.push(...filtered);
    log('DISCOVERY', `Skipped ${formatNumber(stats.discovery.skippedExisting)} already-seeded pools, ${formatNumber(tasks.length)} remaining`);
  }

  if (opts.limit > 0 && tasks.length > opts.limit) {
    tasks.length = opts.limit;
    log('DISCOVERY', `Limited to ${opts.limit} pools`);
  }

  log('DISCOVERY', `Done (${discoveryTimer.stop()})`);

  if (tasks.length === 0) {
    log('HOLDER', 'No pools to process. Exiting.');
    process.exit(0);
  }

  if (shuttingDown) return printSummary(stats, globalTimer);

  // ── Phase 2: Classification ──

  log('CLASSIFY', 'Loading cached classifications from S3...');
  const classifyTimer = createTimer();

  const holderCacheMap = new Map();
  const cacheResults = await Promise.allSettled(
    tasks.map(async (task) => {
      const cache = await loadHolderCache(task.tokenAddress, task.chain);
      return { task, cache };
    })
  );

  let cachedClassifications = 0;
  for (const r of cacheResults) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    const { task, cache } = r.value;
    task.tokenType = cache?.tokenType ?? null;
    if (task.tokenType != null) cachedClassifications++;
    if (cache && cache.holders && cache.holders.length > 0) {
      holderCacheMap.set(`${task.tokenAddress.toLowerCase()}-${task.chain}`, cache);
    }
  }
  log('CLASSIFY', `${formatNumber(cachedClassifications)} loaded from S3 cache (${formatNumber(holderCacheMap.size)} with holder data)`);

  const unclassified = tasks.filter((t) => t.tokenType == null);
  if (unclassified.length > 0) {
    log('CLASSIFY', `Probing ${formatNumber(unclassified.length)} unclassified tokens...`);
    const classMap = await classifyTokensBatch(unclassified);
    for (const t of unclassified) {
      const key = `${t.tokenAddress.toLowerCase()}-${t.chain}`;
      t.tokenType = classMap.get(key) || 'standard';
    }
  }

  const needsRebase = (type) => ['share_based', 'true_rebase', 'needs_rebase'].includes(type);

  let standardTasks = tasks.filter((t) => !needsRebase(t.tokenType));
  let flaggedTasks = tasks.filter((t) => needsRebase(t.tokenType));

  // Apply --standard-only / --flagged-only filters
  if (opts.standardOnly) flaggedTasks = [];
  if (opts.flaggedOnly) standardTasks = [];

  log('CLASSIFY', `${formatNumber(standardTasks.length)} standard, ${formatNumber(flaggedTasks.length)} flagged (${classifyTimer.stop()})`);

  stats.standard.total = standardTasks.length;
  stats.flagged.total = flaggedTasks.length;

  // ── Phase 3: Standard Processing ──

  if (standardTasks.length > 0 && !shuttingDown) {
    // Upfront totalSupply for all standard pools
    log('SUPPLY', 'Fetching totalSupply for standard pools...');
    const supplyTimer = createTimer();
    const standardSupplyMap = {};
    const standardDecimalsMap = {};
    const chainGroups = {};
    for (const t of standardTasks) {
      if (!chainGroups[t.chain]) chainGroups[t.chain] = [];
      chainGroups[t.chain].push(t);
    }
    await Promise.allSettled(
      Object.entries(chainGroups).map(async ([chain, group]) => {
        const seen = new Set();
        const calls = [];
        for (const t of group) {
          const key = t.tokenAddress.toLowerCase();
          if (seen.has(key)) continue;
          seen.add(key);
          calls.push({ target: t.tokenAddress, params: [] });
        }
        try {
          const [supplyResult, decimalsResult] = await Promise.all([
            sdk.api.abi.multiCall({ abi: 'erc20:totalSupply', calls, chain, permitFailure: true }),
            sdk.api.abi.multiCall({ abi: 'erc20:decimals', calls, chain, permitFailure: true }),
          ]);
          for (const item of supplyResult.output) {
            if (item.output) standardSupplyMap[`${item.input.target.toLowerCase()}-${chain}`] = BigInt(item.output);
          }
          for (const item of decimalsResult.output) {
            if (item.output != null) standardDecimalsMap[`${item.input.target.toLowerCase()}-${chain}`] = Number(item.output);
          }
        } catch (err) {
          log('SUPPLY', `Failed for ${chain}: ${err.message}`);
        }
      })
    );
    log('SUPPLY', `Done: ${Object.keys(standardSupplyMap).length} tokens (${supplyTimer.stop()})`);

    // Process standard batches
    const standardTimer = createTimer();
    const totalBatches = Math.ceil(standardTasks.length / STANDARD_BATCH);
    log('STANDARD', `Processing ${formatNumber(standardTasks.length)} pools in ${totalBatches} batches of ${STANDARD_BATCH}...`);

    for (let i = 0; i < standardTasks.length; i += STANDARD_BATCH) {
      if (shuttingDown) break;
      const batchNum = Math.floor(i / STANDARD_BATCH) + 1;
      const batch = standardTasks.slice(i, i + STANDARD_BATCH);
      const batchTimer = createTimer();

      const batchPayloads = [];
      const results = await Promise.allSettled(
        batch.map((t) => processPool(t, standardSupplyMap, standardDecimalsMap, opts.targetDate, stats))
      );

      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        const t = batch[j];
        if (r.status === 'fulfilled' && r.value) {
          batchPayloads.push(r.value);
          stats.standard.success++;
          trackChain(stats, t.chain, 'success');
        } else if (r.status === 'fulfilled') {
          stats.standard.skipped++;
        } else {
          stats.standard.failed++;
          trackChain(stats, t.chain, 'failed');
          log('STANDARD', `  ✗ ${t.tokenAddress} on ${t.chain} — ${r.reason?.message || r.reason}`);
        }
      }

      if (batchPayloads.length > 0 && !opts.dryRun) {
        const dbTimer = createTimer();
        try {
          await insertHolder(batchPayloads);
          stats.db.inserts += batchPayloads.length;
          stats.db.timeMs += dbTimer.elapsed();
        } catch (err) {
          log('DB-ERROR', `Batch insert failed: ${err.message}`);
        }
      } else if (opts.dryRun) {
        stats.db.inserts += batchPayloads.length;
      }

      const pct = ((Math.min(i + STANDARD_BATCH, standardTasks.length) / standardTasks.length) * 100).toFixed(1);
      log('STANDARD', `Batch ${batchNum}/${totalBatches}: ${batchPayloads.length}/${batch.length} success (${pct}%) [${batchTimer.stop()}]`);

      if (i + STANDARD_BATCH < standardTasks.length && !shuttingDown) {
        await new Promise((r) => setTimeout(r, STANDARD_DELAY));
      }
    }

    stats.standard.timeMs = standardTimer.elapsed();
    log('STANDARD', `Done: ${stats.standard.success} success, ${stats.standard.failed} failed, ${stats.standard.skipped} skipped (${standardTimer.stop()})`);
  }

  // ── Phase 4: Flagged Processing ──

  if (flaggedTasks.length > 0 && !shuttingDown) {
    const flaggedTimer = createTimer();
    const totalBatches = Math.ceil(flaggedTasks.length / FLAGGED_BATCH);
    let incrementalCount = 0;
    let seedCount = 0;
    log('FLAGGED', `Processing ${formatNumber(flaggedTasks.length)} pools in ${totalBatches} batches of ${FLAGGED_BATCH}...`);

    // Helper: fetch totalSupply for a flagged batch
    async function fetchSupplyForBatch(batch) {
      const chainGroups = {};
      for (const t of batch) {
        if (!chainGroups[t.chain]) chainGroups[t.chain] = [];
        chainGroups[t.chain].push(t);
      }
      const tsMap = {};
      const decMap = {};
      await Promise.allSettled(
        Object.entries(chainGroups).map(async ([chain, group]) => {
          const seen = new Set();
          const calls = [];
          for (const t of group) {
            const key = t.tokenAddress.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            calls.push({ target: t.tokenAddress, params: [] });
          }
          try {
            const [supplyResult, decimalsResult] = await Promise.all([
              sdk.api.abi.multiCall({ abi: 'erc20:totalSupply', calls, chain, permitFailure: true }),
              sdk.api.abi.multiCall({ abi: 'erc20:decimals', calls, chain, permitFailure: true }),
            ]);
            for (const item of supplyResult.output) {
              if (item.output) tsMap[`${item.input.target.toLowerCase()}-${chain}`] = BigInt(item.output);
            }
            for (const item of decimalsResult.output) {
              if (item.output != null) decMap[`${item.input.target.toLowerCase()}-${chain}`] = Number(item.output);
            }
          } catch (err) {
            log('SUPPLY', `Failed for ${chain}: ${err.message}`);
          }
        })
      );
      return { tsMap, decMap };
    }

    for (let i = 0; i < flaggedTasks.length; i += FLAGGED_BATCH) {
      if (shuttingDown) break;
      const batchNum = Math.floor(i / FLAGGED_BATCH) + 1;
      const batch = flaggedTasks.slice(i, i + FLAGGED_BATCH);
      const batchTimer = createTimer();

      // Split cached vs uncached — reseed forces all through seed
      const cachedTasks = [];
      const uncachedTasks = [];
      for (const task of batch) {
        if (opts.reseed) {
          uncachedTasks.push(task);
        } else {
          const key = `${task.tokenAddress.toLowerCase()}-${task.chain}`;
          if (holderCacheMap.has(key)) {
            cachedTasks.push(task);
          } else {
            uncachedTasks.push(task);
          }
        }
      }

      const { tsMap, decMap } = await fetchSupplyForBatch(batch);
      const batchPayloads = [];

      // Incremental for cached — pass preloaded S3 cache
      if (cachedTasks.length > 0) {
        const results = await Promise.allSettled(
          cachedTasks.map((t) => {
            const key = `${t.tokenAddress.toLowerCase()}-${t.chain}`;
            return processFlaggedIncremental(t, tsMap, decMap, opts.targetDate, stats, holderCacheMap.get(key));
          })
        );
        for (let j = 0; j < results.length; j++) {
          const r = results[j];
          const t = cachedTasks[j];
          if (r.status === 'fulfilled' && r.value) {
            batchPayloads.push(r.value);
            stats.flagged.success++;
            trackChain(stats, t.chain, 'success');
            incrementalCount++;
          } else if (r.status === 'fulfilled') {
            stats.flagged.skipped++;
          } else {
            stats.flagged.failed++;
            trackChain(stats, t.chain, 'failed');
            log('FLAGGED', `  ✗ ${t.tokenAddress} on ${t.chain} — ${r.reason?.message || r.reason}`);
          }
        }
      }

      // Seed for uncached
      if (uncachedTasks.length > 0) {
        const results = await Promise.allSettled(
          uncachedTasks.map((t) => seedFlaggedPool(t, tsMap, decMap, opts.targetDate, stats))
        );
        for (let j = 0; j < results.length; j++) {
          const r = results[j];
          const t = uncachedTasks[j];
          if (r.status === 'fulfilled' && r.value) {
            batchPayloads.push(r.value);
            stats.flagged.success++;
            trackChain(stats, t.chain, 'success');
            seedCount++;
          } else if (r.status === 'fulfilled') {
            stats.flagged.skipped++;
          } else {
            stats.flagged.failed++;
            trackChain(stats, t.chain, 'failed');
            log('FLAGGED', `  ✗ ${t.tokenAddress} on ${t.chain} — ${r.reason?.message || r.reason}`);
          }
        }
      }

      // S3 saves
      const s3Payloads = batchPayloads.filter((p) => p._holderCache);
      if (s3Payloads.length > 0) {
        await Promise.allSettled(
          s3Payloads.map(async (p) => {
            const c = p._holderCache;
            try {
              await saveHolderCache(c.tokenAddress, c.chain, {
                token: c.tokenAddress,
                chain: c.chain,
                lastBlock: c.currentBlock,
                tokenType: c.tokenType,
                holderCount: c.holderCount,
                holders: c.holders.map((h) => ({ address: h.address, balance: String(h.balance) })),
                updatedAt: new Date().toISOString(),
              });
              stats.s3.holderListSaves++;
            } catch (err) {
              stats.s3.saveErrors++;
              log('S3-WARN', `${c.tokenAddress} on ${c.chain}: ${err.message}`);
            }
          })
        );
      }
      for (const p of batchPayloads) delete p._holderCache;

      // DB write
      if (batchPayloads.length > 0 && !opts.dryRun) {
        const dbTimer = createTimer();
        try {
          await insertHolder(batchPayloads);
          stats.db.inserts += batchPayloads.length;
          stats.db.timeMs += dbTimer.elapsed();
        } catch (err) {
          log('DB-ERROR', `Batch insert failed: ${err.message}`);
        }
      } else if (opts.dryRun) {
        stats.db.inserts += batchPayloads.length;
      }

      const pct = ((Math.min(i + FLAGGED_BATCH, flaggedTasks.length) / flaggedTasks.length) * 100).toFixed(1);
      log(
        'FLAGGED',
        `Batch ${batchNum}/${totalBatches}: ${cachedTasks.length} incremental, ${uncachedTasks.length} seed — ` +
          `${batchPayloads.length}/${batch.length} success (${pct}%) [${batchTimer.stop()}]`
      );

      if (i + FLAGGED_BATCH < flaggedTasks.length && !shuttingDown) {
        await new Promise((r) => setTimeout(r, FLAGGED_DELAY));
      }
    }

    stats.flagged.timeMs = flaggedTimer.elapsed();
    log(
      'FLAGGED',
      `Done: ${stats.flagged.success} success, ${stats.flagged.failed} failed, ` +
        `${stats.flagged.skipped} skipped (${incrementalCount} incremental, ${seedCount} seeded) (${flaggedTimer.stop()})`
    );
  }

  printSummary(stats, globalTimer);
};

// ── Summary ──────────────────────────────────────────────────────────────────

function printSummary(stats, globalTimer) {
  const totalSuccess = stats.standard.success + stats.flagged.success;
  const totalPools = stats.standard.total + stats.flagged.total;
  const successRate = totalPools > 0 ? ((totalSuccess / totalPools) * 100).toFixed(1) : '0.0';

  log('SUMMARY', '═══════════════════════════════════════════');
  log('SUMMARY', `Total time:     ${globalTimer.stop()}`);
  log('SUMMARY', `Success:        ${formatNumber(totalSuccess)}/${formatNumber(totalPools)} (${successRate}%)`);
  log('SUMMARY', `Standard:       ${stats.standard.success}/${stats.standard.total} success` +
    (stats.standard.timeMs ? ` (${formatDuration(stats.standard.timeMs)})` : ''));
  log('SUMMARY', `Flagged:        ${stats.flagged.success}/${stats.flagged.total} success` +
    (stats.flagged.timeMs ? ` (${formatDuration(stats.flagged.timeMs)})` : ''));

  if (stats.fallback.ankrCalls > 0) {
    const avg = formatDuration(Math.round(stats.fallback.ankrTimeMs / stats.fallback.ankrCalls));
    log('SUMMARY', `ANKR fallback:  ${stats.fallback.ankrCalls} calls (${stats.fallback.ankrSuccess} success, ${avg} avg)`);
  }
  if (stats.fallback.onChainCalls > 0) {
    const avg = formatDuration(Math.round(stats.fallback.onChainTimeMs / stats.fallback.onChainCalls));
    log('SUMMARY', `On-chain:       ${stats.fallback.onChainCalls} calls (${stats.fallback.onChainSuccess} success, ${avg} avg)`);
  }

  log('SUMMARY', `DB inserts:     ${formatNumber(stats.db.inserts)} rows` +
    (stats.db.timeMs ? ` (${formatDuration(stats.db.timeMs)})` : ''));

  if (stats.s3.classificationSaves > 0 || stats.s3.holderListSaves > 0) {
    log('SUMMARY', `S3 saves:       ${stats.s3.classificationSaves} classification, ${stats.s3.holderListSaves} holder lists` +
      (stats.s3.saveErrors > 0 ? `, ${stats.s3.saveErrors} errors` : ''));
  }

  const chains = Object.entries(stats.perChain).sort((a, b) => b[1].total - a[1].total);
  if (chains.length > 0) {
    log('SUMMARY', '');
    log('SUMMARY', 'Per-chain:');
    for (const [chain, data] of chains) {
      log('SUMMARY', `  ${chain.padEnd(16)}${String(data.total).padStart(5)} total  ${String(data.success).padStart(5)} ok   ${String(data.failed).padStart(3)} fail`);
    }
  }

  log('SUMMARY', '═══════════════════════════════════════════');
  if (shuttingDown) {
    log('SHUTDOWN', 'Partial run — results above reflect completed work only.');
  }
}

// ── Entry Point ──────────────────────────────────────────────────────────────

main()
  .then(() => process.exit(0))
  .catch((err) => {
    log('FATAL', err.message);
    console.error(err);
    process.exit(1);
  });
