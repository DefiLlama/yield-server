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
  saveHolderCache,
  classifyToken,
  classifyTokensBatch,
  classifyByComparison,
  getCurrentBlock,
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
    batchSize: 25,
    flaggedBatch: 5,
    batchDelay: 1000,
    chainConcurrency: 5,
    compareConcurrency: 50,
    date: null,
    dryRun: false,
    skipExisting: false,
    standardOnly: false,
    flaggedOnly: false,
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
      case '--batch-size':
        opts.batchSize = Number(args[++i]);
        break;
      case '--flagged-batch':
        opts.flaggedBatch = Number(args[++i]);
        break;
      case '--batch-delay':
        opts.batchDelay = Number(args[++i]);
        break;
      case '--chain-concurrency':
        opts.chainConcurrency = Number(args[++i]);
        break;
      case '--compare-concurrency':
        opts.compareConcurrency = Number(args[++i]);
        break;
      case '--date':
        opts.date = args[++i];
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--skip-existing':
        opts.skipExisting = true;
        break;
      case '--standard-only':
        opts.standardOnly = true;
        break;
      case '--flagged-only':
        opts.flaggedOnly = true;
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

  // Parse/validate date
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
Usage: node scripts/seedHolders.js [options]

Options:
  --tvl-min N              TVL threshold in USD (default: 10000)
  --batch-size N           Standard batch size (default: 25)
  --flagged-batch N        Flagged batch size (default: 5)
  --batch-delay N          Delay in ms between batches (default: 1000)
  --chain-concurrency N    Concurrent chains for totalSupply (default: 5)
  --compare-concurrency N  Concurrent Peluche comparisons (default: 50)
  --date YYYY-MM-DD        Target date, midnight UTC (default: today)
  --dry-run                Fetch data but skip DB inserts
  --skip-existing          Skip pools already seeded for target date
  --standard-only          Only process standard (rebase=false) tokens
  --flagged-only           Only process flagged (rebase) tokens
  --chain NAME             Only process pools on this chain
  --token ADDRESS          Only process a single token address
  --pool POOL_ID           Only process a single pool by pool ID
  --help                   Show this help

Examples:
  node scripts/seedHolders.js --help
  node scripts/seedHolders.js --token 0xae7ab96520de3a18e5e111b5eaab095312d7fe84 --dry-run
  node scripts/seedHolders.js --pool 0xae7ab96520de3a18e5e111b5eaab095312d7fe84-ethereum --dry-run
  node scripts/seedHolders.js --standard-only
  node scripts/seedHolders.js --standard-only --chain ethereum --tvl-min 100000
  node scripts/seedHolders.js --skip-existing

Environment Variables:
  DATABASE_URL          Required — PostgreSQL connection string
  HOLDERS_API_KEY       Optional — Peluche API key (higher rate limits)
  ANKR_API_KEY          Optional — ANKR fallback (skipped if missing)
  BUCKET_HOLDERS_DATA           Optional — S3 bucket for holder cache (skipped if missing)
`);
}

// ── Logging Utilities ────────────────────────────────────────────────────────

function timestamp() {
  return new Date().toISOString().slice(11, 19);
}

const PHASE_WIDTH = 12;

function log(phase, message) {
  const tag = phase.padEnd(PHASE_WIDTH);
  console.log(`[${timestamp()}] [${tag}] ${message}`);
}

function createTimer() {
  const start = Date.now();
  return {
    elapsed() {
      return Date.now() - start;
    },
    stop() {
      return formatDuration(Date.now() - start);
    },
  };
}

function formatDuration(ms) {
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  const rs = s % 60;
  if (m < 60) return `${m}m ${rs.toFixed(1)}s`;
  const h = Math.floor(m / 60);
  const rm = m % 60;
  return `${h}h ${rm}m ${Math.floor(rs)}s`;
}

function formatNumber(n) {
  return n.toLocaleString('en-US');
}

function logProgress(current, total, label) {
  const pct = total > 0 ? ((current / total) * 100).toFixed(1) : '0.0';
  log(label, `${formatNumber(current)}/${formatNumber(total)} (${pct}%)`);
}

// ── Stats Accumulator ────────────────────────────────────────────────────────

function createStats() {
  return {
    discovery: {
      poolsFromDb: 0,
      filteredOut: 0,
      validEvm: 0,
      skippedExisting: 0,
    },
    classification: {
      true_rebase: 0,
      share_based: 0,
      needs_rebase: 0,
      standard: 0,
      unknown: 0,
      comparisonChecked: 0,
      defaulted: 0,
    },
    totalSupply: {
      fetched: 0,
      failed: 0,
      timeMs: 0,
      perChain: {},
    },
    standard: {
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      timeMs: 0,
    },
    flagged: {
      total: 0,
      success: 0,
      failed: 0,
      skipped: 0,
      timeMs: 0,
    },
    fallback: {
      ankrCalls: 0,
      ankrSuccess: 0,
      ankrTimeMs: 0,
      onChainCalls: 0,
      onChainSuccess: 0,
      onChainTimeMs: 0,
    },
    s3: {
      classificationSaves: 0,
      holderListSaves: 0,
      saveErrors: 0,
    },
    perChain: {},
    db: {
      inserts: 0,
      timeMs: 0,
    },
  };
}

function trackChain(stats, chain, outcome) {
  if (!stats.perChain[chain]) {
    stats.perChain[chain] = { total: 0, success: 0, failed: 0 };
  }
  stats.perChain[chain].total++;
  if (outcome === 'success') stats.perChain[chain].success++;
  if (outcome === 'failed') stats.perChain[chain].failed++;
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
      decimals: decimals ?? null,
      holders: top10.map((h) => ({
        address: h.address,
        balance: String(h.balance),
        balancePct: Number((h.balance * 10000n) / totalSupply) / 100,
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
    // Peluche error — try ANKR fallback
    if (process.env.ANKR_API_KEY) {
      const t = createTimer();
      stats.fallback.ankrCalls++;
      try {
        const ankrData = await getAnkrTopHolders(tokenAddress, chain, 15);
        stats.fallback.ankrTimeMs += t.elapsed();
        if (ankrData && ankrData.holdersCount > 0) {
          stats.fallback.ankrSuccess++;
          return buildResult(
            ankrData.holders,
            ankrData.holdersCount,
            configID,
            tvlUsd,
            totalSupplyMap,
            decimalsMap,
            chain,
            tokenAddress,
            today
          );
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
          return buildResult(
            ankrData.holders,
            ankrData.holdersCount,
            configID,
            tvlUsd,
            totalSupplyMap,
            decimalsMap,
            chain,
            tokenAddress,
            today
          );
        }
      } catch (ankrErr) {
        stats.fallback.ankrTimeMs += t.elapsed();
      }
    }
    return null;
  }

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

  const avgPositionUsd = holderCount > 0 ? tvlUsd / holderCount : null;

  let top10Pct = null;
  let top10Holders = null;
  const supplyKey = `${tokenAddress.toLowerCase()}-${chain}`;
  const totalSupply = totalSupplyMap[supplyKey];
  const decimals = decimalsMap[supplyKey] ?? null;

  if (data.deltas && data.deltas.length > 0 && totalSupply && totalSupply > 0n) {
    const top10Balance = data.deltas.reduce(
      (sum, d) => sum + BigInt(d.delta || d.balance || d.amount || 0),
      0n
    );
    top10Pct = Number((top10Balance * 10000n) / totalSupply) / 100;

    top10Holders = {
      decimals: decimals ?? null,
      holders: data.deltas.map((d) => ({
        address: d.holder || d.address || d.owner,
        balance: String(d.delta || d.balance || d.amount || 0),
        balancePct:
          totalSupply > 0n
            ? Number(
                (BigInt(d.delta || d.balance || d.amount || 0) * 10000n) /
                  totalSupply
              ) / 100
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

// On-chain balanceOf fallback for share-based / failed flagged pools
async function processShareBasedPool(task, totalSupplyMap, decimalsMap, today, stats) {
  const { configID, chain, chainId, tokenAddress, tvlUsd } = task;

  try {
    const data = await fetchHolders(chainId, tokenAddress, 100000000000, false);

    if (!data.deltas || data.deltas.length === 0) {
      return processPool(task, totalSupplyMap, decimalsMap, today, stats);
    }

    const addresses = data.deltas
      .map((d) => d.address || d.owner)
      .filter(Boolean);
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
      throw refineErr; // re-throw to outer catch
    }
    const holderCount = refined.length;

    return buildResult(
      refined,
      holderCount,
      configID,
      tvlUsd,
      totalSupplyMap,
      decimalsMap,
      chain,
      tokenAddress,
      today
    );
  } catch (err) {
    return processPool(task, totalSupplyMap, decimalsMap, today, stats);
  }
}

// Flagged pool seed — full rebase=true fetch + S3 cache save
async function seedFlaggedPool(task, totalSupplyMap, decimalsMap, today, stats) {
  const { configID, chain, chainId, tokenAddress, tvlUsd } = task;

  try {
    // Pre-check holder count
    const preview = await fetchHolders(chainId, tokenAddress, 1, false);
    if (preview.total_holders > HIGH_HOLDER_THRESHOLD) {
      log(
        'FLAGGED',
        `${tokenAddress} on ${chain}: ${formatNumber(preview.total_holders)} holders, using ANKR fallback`
      );
      if (process.env.ANKR_API_KEY) {
        const t = createTimer();
        stats.fallback.ankrCalls++;
        try {
          const ankrData = await getAnkrTopHolders(tokenAddress, chain, 15);
          stats.fallback.ankrTimeMs += t.elapsed();
          if (ankrData && ankrData.holders.length > 0) {
            stats.fallback.ankrSuccess++;
            return buildResult(
              ankrData.holders,
              ankrData.holdersCount,
              configID,
              tvlUsd,
              totalSupplyMap,
              decimalsMap,
              chain,
              tokenAddress,
              today
            );
          }
        } catch (ankrErr) {
          stats.fallback.ankrTimeMs += t.elapsed();
        }
      }
      // ANKR unavailable or failed — fall through to on-chain
      return processShareBasedPool(task, totalSupplyMap, decimalsMap, today, stats);
    }

    const data = await fetchHolders(chainId, tokenAddress, 100000000000, true);
    if (!data.deltas || data.deltas.length === 0) {
      return processPool(task, totalSupplyMap, decimalsMap, today, stats);
    }

    const holders = data.deltas
      .filter((d) => d.holder)
      .map((d) => ({
        address: d.holder.toLowerCase(),
        balance: BigInt(d.delta || 0),
      }))
      .filter((h) => h.balance > 0n)
      .sort((a, b) =>
        b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0
      );

    if (holders.length === 0) {
      return processPool(task, totalSupplyMap, decimalsMap, today, stats);
    }

    const holderCount = holders.length;

    // Save to S3 if BUCKET_HOLDERS_DATA is set
    if (process.env.BUCKET_HOLDERS_DATA) {
      try {
        const [currentBlock, tokenType] = await Promise.all([
          getCurrentBlock(chain),
          classifyToken(tokenAddress, chain),
        ]);

        await saveHolderCache(tokenAddress, chain, {
          token: tokenAddress,
          chain,
          lastBlock: currentBlock,
          tokenType,
          holderCount,
          holders: holders.map((h) => ({
            address: h.address,
            balance: String(h.balance),
          })),
          updatedAt: new Date().toISOString(),
        });
        stats.s3.holderListSaves++;
      } catch (err) {
        stats.s3.saveErrors++;
        log('S3-WARN', `Cache save failed for ${tokenAddress} on ${chain}: ${err.message}`);
      }
    }

    return buildResult(
      holders,
      holderCount,
      configID,
      tvlUsd,
      totalSupplyMap,
      decimalsMap,
      chain,
      tokenAddress,
      today
    );
  } catch (err) {
    log('FLAGGED', `Seed failed for ${tokenAddress} on ${chain}: ${err.message}`);
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

  // ── Config Banner ──────────────────────────────────────────────────────

  log('SEED', '═══════════════════════════════════════════');
  log('SEED', 'Holder Data Seeding Script');
  log('CONFIG', `TVL threshold:  $${formatNumber(opts.tvlMin)}`);
  log('CONFIG', `Target date:    ${opts.targetDate.toISOString()}`);
  log('CONFIG', `Batch size:     ${opts.batchSize} (standard), ${opts.flaggedBatch} (flagged), ${opts.batchDelay}ms delay`);
  log('CONFIG', `Dry run:        ${opts.dryRun}`);
  log('CONFIG', `Skip existing:  ${opts.skipExisting}`);
  log('CONFIG', `Standard only:  ${opts.standardOnly}`);
  log('CONFIG', `Flagged only:   ${opts.flaggedOnly}`);
  if (opts.chain) log('CONFIG', `Chain filter:   ${opts.chain}`);
  if (opts.token) log('CONFIG', `Token filter:   ${opts.token}`);
  if (opts.pool) log('CONFIG', `Pool filter:    ${opts.pool}`);
  log('CONFIG', `DATABASE_URL:   ${process.env.DATABASE_URL ? 'set' : 'MISSING'}`);
  log('CONFIG', `HOLDERS_API_KEY:${process.env.HOLDERS_API_KEY ? ' set' : ' not set (lower rate limits)'}`);
  log('CONFIG', `ANKR_API_KEY:   ${process.env.ANKR_API_KEY ? 'set' : 'not set (ANKR fallback disabled)'}`);
  log('CONFIG', `BUCKET_HOLDERS_DATA:    ${process.env.BUCKET_HOLDERS_DATA ? 'set' : 'not set (S3 saves disabled)'}`);
  log('SEED', '═══════════════════════════════════════════');

  if (!process.env.DATABASE_URL) {
    log('ERROR', 'DATABASE_URL is required. Set it in config.env or environment.');
    process.exit(1);
  }

  // ── Phase 1: Discovery ─────────────────────────────────────────────────

  log('DISCOVERY', 'Fetching eligible pools from DB...');
  const discoveryTimer = createTimer();

  const pools = await getEligiblePools(opts.tvlMin);
  stats.discovery.poolsFromDb = pools.length;
  log('DISCOVERY', `Found ${formatNumber(pools.length)} pools from DB`);

  const tasks = [];
  for (const pool of pools) {
    if (!pool.token || !isValidEvmAddress(pool.token)) {
      stats.discovery.filteredOut++;
      continue;
    }
    if (!pool.chain) {
      stats.discovery.filteredOut++;
      continue;
    }

    // Normalize chain name (DB stores "Ethereum", APIs need "ethereum")
    const chain = getChainKeyFromLabel(pool.chain) || pool.chain;

    const chainId = resolveChainId(chain);
    if (chainId == null) {
      stats.discovery.filteredOut++;
      continue;
    }

    // Apply CLI filters
    if (opts.chain && chain !== opts.chain) {
      stats.discovery.filteredOut++;
      continue;
    }
    if (opts.token && pool.token.toLowerCase() !== opts.token) {
      stats.discovery.filteredOut++;
      continue;
    }
    if (opts.pool && pool.pool.toLowerCase() !== opts.pool) {
      stats.discovery.filteredOut++;
      continue;
    }

    tasks.push({
      configID: pool.configID,
      pool: pool.pool,
      chain,
      chainId,
      tokenAddress: pool.token,
      tvlUsd: pool.tvlUsd,
    });
  }

  stats.discovery.validEvm = tasks.length;
  log(
    'DISCOVERY',
    `${formatNumber(tasks.length)} valid EVM pools (${formatNumber(stats.discovery.filteredOut)} excluded)`
  );

  // Skip existing (resumability)
  if (opts.skipExisting) {
    const conn = await connect();
    const existing = await conn.query(
      'SELECT "configID" FROM holder_daily WHERE timestamp = $1',
      [opts.targetDate.toISOString()]
    );
    const existingSet = new Set(existing.map((r) => r.configID));
    const beforeCount = tasks.length;
    const filtered = tasks.filter((t) => !existingSet.has(t.configID));
    stats.discovery.skippedExisting = beforeCount - filtered.length;
    tasks.length = 0;
    tasks.push(...filtered);
    log(
      'DISCOVERY',
      `Skipped ${formatNumber(stats.discovery.skippedExisting)} already-seeded pools, ${formatNumber(tasks.length)} remaining`
    );
  }

  log('DISCOVERY', `Done (${discoveryTimer.stop()})`);

  if (tasks.length === 0) {
    log('SEED', 'No pools to process. Exiting.');
    process.exit(0);
  }

  if (shuttingDown) return printSummary(stats, globalTimer);

  // ── Phase 2: Total Supply ──────────────────────────────────────────────

  log('SUPPLY', 'Fetching totalSupply and decimals per chain...');
  const supplyTimer = createTimer();

  const chainGroups = {};
  for (const t of tasks) {
    if (!chainGroups[t.chain]) chainGroups[t.chain] = [];
    chainGroups[t.chain].push(t);
  }

  const totalSupplyMap = {};
  const decimalsMap = {};
  const chainEntries = Object.entries(chainGroups);

  for (let i = 0; i < chainEntries.length; i += opts.chainConcurrency) {
    if (shuttingDown) break;
    const chunk = chainEntries.slice(i, i + opts.chainConcurrency);
    await Promise.allSettled(
      chunk.map(async ([chain, group]) => {
        const t = createTimer();
        try {
          const seen = new Set();
          const calls = [];
          for (const task of group) {
            const key = task.tokenAddress.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            calls.push({ target: task.tokenAddress, params: [] });
          }
          const [supplyResult, decimalsResult] = await Promise.all([
            sdk.api.abi.multiCall({
              abi: 'erc20:totalSupply',
              calls,
              chain,
              permitFailure: true,
            }),
            sdk.api.abi.multiCall({
              abi: 'erc20:decimals',
              calls,
              chain,
              permitFailure: true,
            }),
          ]);
          let ok = 0;
          for (const item of supplyResult.output) {
            if (item.output) {
              totalSupplyMap[`${item.input.target.toLowerCase()}-${chain}`] =
                BigInt(item.output);
              ok++;
            }
          }
          for (const item of decimalsResult.output) {
            if (item.output != null) {
              decimalsMap[`${item.input.target.toLowerCase()}-${chain}`] =
                Number(item.output);
            }
          }
          stats.totalSupply.fetched += ok;
          stats.totalSupply.perChain[chain] = {
            tokens: calls.length,
            success: ok,
            timeMs: t.elapsed(),
          };
          log('SUPPLY', `${chain}: ${ok}/${calls.length} tokens (${t.stop()})`);
        } catch (err) {
          stats.totalSupply.failed++;
          stats.totalSupply.perChain[chain] = {
            tokens: group.length,
            success: 0,
            timeMs: t.elapsed(),
            error: err.message,
          };
          log('SUPPLY', `${chain}: FAILED — ${err.message}`);
        }
      })
    );
  }

  stats.totalSupply.timeMs = supplyTimer.elapsed();
  log('SUPPLY', `Done (${supplyTimer.stop()})`);

  if (shuttingDown) return printSummary(stats, globalTimer);

  // ── Phase 3: Classification ────────────────────────────────────────────

  log('CLASSIFY', 'Running ABI classification...');
  const classifyTimer = createTimer();

  const classMap = await classifyTokensBatch(tasks);

  for (const t of tasks) {
    const key = `${t.tokenAddress.toLowerCase()}-${t.chain}`;
    t.tokenType = classMap.get(key) || 'unknown';
  }

  // Count ABI results
  for (const t of tasks) {
    if (stats.classification[t.tokenType] !== undefined) {
      stats.classification[t.tokenType]++;
    }
  }

  const abiUnknowns = tasks.filter((t) => t.tokenType === 'unknown');
  log(
    'CLASSIFY',
    `ABI: ${stats.classification.true_rebase} true_rebase, ` +
      `${stats.classification.share_based} share_based, ` +
      `${abiUnknowns.length} unknown`
  );

  if (opts.standardOnly) {
    // Treat all unknowns as standard
    for (const t of abiUnknowns) {
      t.tokenType = 'standard';
      stats.classification.standard++;
      stats.classification.unknown--;
      stats.classification.defaulted++;
    }
    log('CLASSIFY', `Standard-only mode: ${abiUnknowns.length} unknowns → standard`);
  } else {
    // Peluche comparison for unknowns
    if (abiUnknowns.length > 0) {
      log(
        'CLASSIFY',
        `Running Peluche comparison for ${formatNumber(abiUnknowns.length)} unknown tokens...`
      );

      const comparisonCached = new Set();
      for (let i = 0; i < abiUnknowns.length; i += opts.compareConcurrency) {
        if (shuttingDown) break;
        const batch = abiUnknowns.slice(i, i + opts.compareConcurrency);
        await Promise.allSettled(
          batch.map(async (task) => {
            const result = await classifyByComparison(
              task.chainId,
              task.tokenAddress,
              task.chain
            );
            if (result == null) return;
            task.tokenType = result;
            stats.classification.comparisonChecked++;

            // Update classification counts
            if (result !== 'unknown') {
              stats.classification.unknown--;
              if (stats.classification[result] !== undefined) {
                stats.classification[result]++;
              }
            }

            // Save classification to S3
            if (process.env.BUCKET_HOLDERS_DATA) {
              try {
                await saveHolderCache(task.tokenAddress, task.chain, {
                  token: task.tokenAddress,
                  chain: task.chain,
                  tokenType: result,
                  lastBlock: 0,
                  holderCount: 0,
                  holders: [],
                  updatedAt: new Date().toISOString(),
                });
                stats.s3.classificationSaves++;
                comparisonCached.add(
                  `${task.tokenAddress.toLowerCase()}-${task.chain}`
                );
              } catch (err) {
                stats.s3.saveErrors++;
              }
            }
          })
        );
        logProgress(
          Math.min(i + opts.compareConcurrency, abiUnknowns.length),
          abiUnknowns.length,
          'CLASSIFY'
        );
      }

      // Default remaining unknowns to standard
      const stillUnknown = abiUnknowns.filter((t) => t.tokenType === 'unknown');
      for (const t of stillUnknown) {
        t.tokenType = 'standard';
        stats.classification.standard++;
        stats.classification.unknown--;
        stats.classification.defaulted++;
      }

      if (stillUnknown.length > 0) {
        log(
          'CLASSIFY',
          `${stillUnknown.length} tokens defaulted to standard (comparison failed/skipped)`
        );
      }

      // Cache ABI-classified tokens to S3 (that weren't comparison-cached)
      if (process.env.BUCKET_HOLDERS_DATA) {
        const toCache = tasks.filter((t) => {
          const key = `${t.tokenAddress.toLowerCase()}-${t.chain}`;
          return (
            !comparisonCached.has(key) &&
            t.tokenType !== 'standard' &&
            !stillUnknown.includes(t)
          );
        });
        if (toCache.length > 0) {
          const cacheTimer = createTimer();
          await Promise.allSettled(
            toCache.map(async (task) => {
              try {
                await saveHolderCache(task.tokenAddress, task.chain, {
                  token: task.tokenAddress,
                  chain: task.chain,
                  tokenType: task.tokenType,
                  lastBlock: 0,
                  holderCount: 0,
                  holders: [],
                  updatedAt: new Date().toISOString(),
                });
                stats.s3.classificationSaves++;
              } catch (err) {
                stats.s3.saveErrors++;
              }
            })
          );
          log(
            'S3-CACHE',
            `Saved classification for ${formatNumber(toCache.length)} tokens to S3 (${cacheTimer.stop()})`
          );
        }
      }
    }
  }

  log(
    'CLASSIFY',
    `Final: ${stats.classification.true_rebase} true_rebase, ` +
      `${stats.classification.share_based} share_based, ` +
      `${stats.classification.needs_rebase} needs_rebase, ` +
      `${stats.classification.standard} standard` +
      (stats.classification.defaulted > 0
        ? ` (${stats.classification.defaulted} defaulted)`
        : '') +
      ` (${classifyTimer.stop()})`
  );

  if (shuttingDown) return printSummary(stats, globalTimer);

  // ── Phase 4: Split ─────────────────────────────────────────────────────

  // Skip tokens missing totalSupply — top10 data can't be computed
  const hasTotalSupply = (t) =>
    totalSupplyMap[`${t.tokenAddress.toLowerCase()}-${t.chain}`] != null;

  const noSupply = tasks.filter((t) => !hasTotalSupply(t));
  if (noSupply.length > 0) {
    log('SPLIT', `Skipping ${formatNumber(noSupply.length)} pools with no totalSupply data`);
    for (const t of noSupply) {
      log('SKIP', `${t.tokenAddress} on ${t.chain} (${t.configID})`);
    }
  }
  const validTasks = tasks.filter(hasTotalSupply);

  const needsRebase = (type) =>
    ['share_based', 'true_rebase', 'needs_rebase'].includes(type);

  let standardTasks, flaggedTasks;
  if (opts.standardOnly) {
    standardTasks = validTasks.filter((t) => !needsRebase(t.tokenType));
    flaggedTasks = [];
    const excluded = validTasks.length - standardTasks.length;
    if (excluded > 0) {
      log('SPLIT', `Excluded ${formatNumber(excluded)} flagged tokens (--standard-only)`);
    }
  } else if (opts.flaggedOnly) {
    standardTasks = [];
    flaggedTasks = validTasks.filter((t) => needsRebase(t.tokenType));
    const excluded = validTasks.length - flaggedTasks.length;
    if (excluded > 0) {
      log('SPLIT', `Excluded ${formatNumber(excluded)} standard tokens (--flagged-only)`);
    }
  } else {
    standardTasks = validTasks.filter((t) => !needsRebase(t.tokenType));
    flaggedTasks = validTasks.filter((t) => needsRebase(t.tokenType));
  }

  stats.standard.total = standardTasks.length;
  stats.flagged.total = flaggedTasks.length;

  log(
    'SPLIT',
    `${formatNumber(standardTasks.length)} standard, ${formatNumber(flaggedTasks.length)} flagged`
  );

  // ── Phase 5: Standard Processing ──────────────────────────────────────

  if (standardTasks.length > 0) {
    log('STANDARD', `Processing ${formatNumber(standardTasks.length)} pools...`);
    const standardTimer = createTimer();
    const totalBatches = Math.ceil(standardTasks.length / opts.batchSize);

    for (let i = 0; i < standardTasks.length; i += opts.batchSize) {
      if (shuttingDown) break;
      const batchNum = Math.floor(i / opts.batchSize) + 1;
      const batch = standardTasks.slice(i, i + opts.batchSize);
      const batchTimer = createTimer();

      const batchPayloads = [];
      const results = await Promise.allSettled(
        batch.map((t) => processPool(t, totalSupplyMap, decimalsMap, opts.targetDate, stats))
      );

      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        const t = batch[j];
        if (r.status === 'fulfilled') {
          if (r.value) {
            batchPayloads.push(r.value);
            stats.standard.success++;
            trackChain(stats, t.chain, 'success');
          } else {
            stats.standard.skipped++;
          }
        } else {
          stats.standard.failed++;
          trackChain(stats, t.chain, 'failed');
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
          stats.standard.failed += batchPayloads.length;
          stats.standard.success -= batchPayloads.length;
        }
      } else if (opts.dryRun && batchPayloads.length > 0) {
        stats.db.inserts += batchPayloads.length;
      }

      const pct = ((Math.min(i + opts.batchSize, standardTasks.length) / standardTasks.length) * 100).toFixed(1);
      log(
        'STANDARD',
        `Batch ${batchNum}/${totalBatches}: ${batch.length} pools (${pct}%) [${batchTimer.stop()}]`
      );

      if (i + opts.batchSize < standardTasks.length && opts.batchDelay > 0 && !shuttingDown) {
        await new Promise((r) => setTimeout(r, opts.batchDelay));
      }
    }

    stats.standard.timeMs = standardTimer.elapsed();
    log(
      'STANDARD',
      `Done: ${stats.standard.success} success, ${stats.standard.failed} failed, ` +
        `${stats.standard.skipped} skipped (${standardTimer.stop()})`
    );
    if (stats.fallback.ankrCalls > 0) {
      const avg =
        stats.fallback.ankrCalls > 0
          ? formatDuration(Math.round(stats.fallback.ankrTimeMs / stats.fallback.ankrCalls))
          : '0ms';
      log(
        'STANDARD',
        `ANKR fallback: ${stats.fallback.ankrCalls} calls (${stats.fallback.ankrSuccess} success, ${avg} avg)`
      );
    }
  }

  if (shuttingDown) return printSummary(stats, globalTimer);

  // ── Phase 6: Flagged Processing ────────────────────────────────────────

  if (flaggedTasks.length > 0) {
    log('FLAGGED', `Processing ${formatNumber(flaggedTasks.length)} pools...`);
    const flaggedTimer = createTimer();
    const totalBatches = Math.ceil(flaggedTasks.length / opts.flaggedBatch);

    // Track fallback counts before flagged processing to report delta
    const ankrBefore = stats.fallback.ankrCalls;
    const onChainBefore = stats.fallback.onChainCalls;

    for (let i = 0; i < flaggedTasks.length; i += opts.flaggedBatch) {
      if (shuttingDown) break;
      const batchNum = Math.floor(i / opts.flaggedBatch) + 1;
      const batch = flaggedTasks.slice(i, i + opts.flaggedBatch);
      const batchTimer = createTimer();

      const batchPayloads = [];
      const results = await Promise.allSettled(
        batch.map((t) =>
          seedFlaggedPool(t, totalSupplyMap, decimalsMap, opts.targetDate, stats)
        )
      );

      for (let j = 0; j < results.length; j++) {
        const r = results[j];
        const t = batch[j];
        if (r.status === 'fulfilled') {
          if (r.value) {
            batchPayloads.push(r.value);
            stats.flagged.success++;
            trackChain(stats, t.chain, 'success');
          } else {
            stats.flagged.skipped++;
          }
        } else {
          stats.flagged.failed++;
          trackChain(stats, t.chain, 'failed');
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
          stats.flagged.failed += batchPayloads.length;
          stats.flagged.success -= batchPayloads.length;
        }
      } else if (opts.dryRun && batchPayloads.length > 0) {
        stats.db.inserts += batchPayloads.length;
      }

      const pct = ((Math.min(i + opts.flaggedBatch, flaggedTasks.length) / flaggedTasks.length) * 100).toFixed(1);
      log(
        'FLAGGED',
        `Batch ${batchNum}/${totalBatches}: ${batch.length} pools (${pct}%) [${batchTimer.stop()}]`
      );

      if (i + opts.flaggedBatch < flaggedTasks.length && opts.batchDelay > 0 && !shuttingDown) {
        await new Promise((r) => setTimeout(r, opts.batchDelay));
      }
    }

    stats.flagged.timeMs = flaggedTimer.elapsed();
    log(
      'FLAGGED',
      `Done: ${stats.flagged.success} success, ${stats.flagged.failed} failed, ` +
        `${stats.flagged.skipped} skipped (${flaggedTimer.stop()})`
    );

    const flaggedAnkr = stats.fallback.ankrCalls - ankrBefore;
    const flaggedOnChain = stats.fallback.onChainCalls - onChainBefore;
    if (flaggedAnkr > 0) {
      log('FLAGGED', `ANKR fallback: ${flaggedAnkr} calls`);
    }
    if (flaggedOnChain > 0) {
      log(
        'FLAGGED',
        `On-chain balanceOf: ${flaggedOnChain} calls (${stats.fallback.onChainSuccess} success)`
      );
    }
    if (stats.s3.holderListSaves > 0) {
      log('FLAGGED', `S3 holder cache saves: ${stats.s3.holderListSaves}`);
    }
  }

  // ── Phase 7: Summary ──────────────────────────────────────────────────

  printSummary(stats, globalTimer);
}

function printSummary(stats, globalTimer) {
  const totalSuccess = stats.standard.success + stats.flagged.success;
  const totalPools = stats.standard.total + stats.flagged.total;
  const successRate =
    totalPools > 0 ? ((totalSuccess / totalPools) * 100).toFixed(1) : '0.0';

  log('SUMMARY', '═══════════════════════════════════════════');
  log('SUMMARY', `Total time:     ${globalTimer.stop()}`);
  log(
    'SUMMARY',
    `Success:        ${formatNumber(totalSuccess)}/${formatNumber(totalPools)} (${successRate}%)`
  );
  log(
    'SUMMARY',
    `Standard:       ${stats.standard.success}/${stats.standard.total} success` +
      (stats.standard.timeMs ? ` (${formatDuration(stats.standard.timeMs)})` : '')
  );
  log(
    'SUMMARY',
    `Flagged:        ${stats.flagged.success}/${stats.flagged.total} success` +
      (stats.flagged.timeMs ? ` (${formatDuration(stats.flagged.timeMs)})` : '')
  );

  if (stats.fallback.ankrCalls > 0) {
    const avg = formatDuration(
      Math.round(stats.fallback.ankrTimeMs / stats.fallback.ankrCalls)
    );
    log(
      'SUMMARY',
      `ANKR fallback:  ${stats.fallback.ankrCalls} calls (${stats.fallback.ankrSuccess} success, ${avg} avg)`
    );
  }
  if (stats.fallback.onChainCalls > 0) {
    const avg = formatDuration(
      Math.round(stats.fallback.onChainTimeMs / stats.fallback.onChainCalls)
    );
    log(
      'SUMMARY',
      `On-chain:       ${stats.fallback.onChainCalls} calls (${stats.fallback.onChainSuccess} success, ${avg} avg)`
    );
  }

  log(
    'SUMMARY',
    `DB inserts:     ${formatNumber(stats.db.inserts)} rows` +
      (stats.db.timeMs ? ` (${formatDuration(stats.db.timeMs)})` : '')
  );

  if (stats.s3.classificationSaves > 0 || stats.s3.holderListSaves > 0) {
    log(
      'SUMMARY',
      `S3 saves:       ${stats.s3.classificationSaves} classification, ${stats.s3.holderListSaves} holder lists` +
        (stats.s3.saveErrors > 0
          ? `, ${stats.s3.saveErrors} errors`
          : '')
    );
  }

  // Per-chain breakdown
  const chains = Object.entries(stats.perChain).sort(
    (a, b) => b[1].total - a[1].total
  );
  if (chains.length > 0) {
    log('SUMMARY', '');
    log('SUMMARY', 'Per-chain:');
    for (const [chain, data] of chains) {
      const name = chain.padEnd(16);
      log(
        'SUMMARY',
        `  ${name}${String(data.total).padStart(5)} total  ${String(data.success).padStart(5)} ok   ${String(data.failed).padStart(3)} fail`
      );
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
