const sdk = require('@defillama/sdk');
const { getChainKeyFromLabel } = sdk.chainUtils;

const {
  fetchHolders,
  isValidEvmAddress,
  resolveChainId,
  refineHoldersOnChain,
  loadHolderCache,
  saveHolderCache,
  classifyToken,
  classifyTokensBatch,
  classifyByComparison,
  getCurrentBlock,
  getAnkrTopHolders,
  HIGH_HOLDER_THRESHOLD,
} = require('../utils/holderApi');
const { getEligiblePools, insertHolder } = require('../queries/holder');

const BATCH_SIZE = 25;
const FLAGGED_BATCH_SIZE = 5;
const BATCH_DELAY_MS = 1000;
const MAX_SEED_PER_RUN = 75;
const CLASSIFY_BATCH_SIZE = 500;
const TOP_N_RECHECK = 100;

// Chains where snapshot/from_block is not yet supported — always do full seed
const NO_SNAPSHOT_CHAINS = new Set(['bsc', 'polygon', 'xdai']);

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await main();
};

function elapsed(start) {
  const ms = Date.now() - start;
  if (ms < 1000) return `${ms}ms`;
  const s = ms / 1000;
  if (s < 60) return `${s.toFixed(1)}s`;
  const m = Math.floor(s / 60);
  return `${m}m ${(s % 60).toFixed(0)}s`;
}

const main = async () => {
  const startTime = Date.now();
  console.log('═══ DAILY HOLDER PROCESSING ═══');

  // ── Discovery ──
  const discoveryStart = Date.now();
  const pools = await getEligiblePools();

  const tasks = [];
  for (const pool of pools) {
    if (!pool.token || !isValidEvmAddress(pool.token)) continue;
    if (!pool.chain) continue;

    const chain = getChainKeyFromLabel(pool.chain) || pool.chain;
    const chainId = resolveChainId(chain);
    if (chainId == null) continue;

    tasks.push({
      configID: pool.configID,
      chain,
      chainId,
      tokenAddress: pool.token,
      tvlUsd: pool.tvlUsd,
    });
  }

  console.log(
    `[DISCOVERY] ${tasks.length} valid EVM pools (${pools.length - tasks.length} filtered) [${elapsed(discoveryStart)}]`
  );

  // ── Classification ──
  const classifyStart = Date.now();

  // Load cached classifications from S3
  const cacheResults = await Promise.allSettled(
    tasks.map(async (task) => {
      const cache = await loadHolderCache(task.tokenAddress, task.chain);
      return { task, cache };
    })
  );

  let cachedClassifications = 0;
  for (const r of cacheResults) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    r.value.task.tokenType = r.value.cache?.tokenType ?? null;
    if (r.value.task.tokenType != null) cachedClassifications++;
  }

  console.log(`[CLASSIFY] ${cachedClassifications} loaded from S3 cache`);

  // Classify unclassified tokens via on-chain interface probing
  const unclassifiedTasks = tasks.filter((t) => t.tokenType == null);
  if (unclassifiedTasks.length > 0) {
    console.log(`[CLASSIFY] Probing ${unclassifiedTasks.length} unclassified tokens`);
    const classMap = await classifyTokensBatch(unclassifiedTasks);

    for (const t of unclassifiedTasks) {
      const key = `${t.tokenAddress.toLowerCase()}-${t.chain}`;
      t.tokenType = classMap.get(key) || 'unknown';
    }

    // For unknowns, try llamao holders API rebase=false vs rebase=true comparison
    const COMPARE_CONCURRENCY = 50;
    const unknownTasks = unclassifiedTasks.filter(
      (t) => t.tokenType === 'unknown'
    );
    const toCompare = unknownTasks.slice(0, CLASSIFY_BATCH_SIZE);
    const comparisonCached = new Set();
    if (toCompare.length > 0) {
      console.log(`[CLASSIFY] Running Peluche comparison for ${toCompare.length} unknown tokens`);
      for (let i = 0; i < toCompare.length; i += COMPARE_CONCURRENCY) {
        const batch = toCompare.slice(i, i + COMPARE_CONCURRENCY);
        await Promise.allSettled(
          batch.map(async (task) => {
            const result = await classifyByComparison(
              task.chainId,
              task.tokenAddress,
              task.chain
            );
            if (result == null) return;
            task.tokenType = result;
            await saveHolderCache(task.tokenAddress, task.chain, {
              token: task.tokenAddress,
              chain: task.chain,
              tokenType: result,
              lastBlock: 0,
              holderCount: 0,
              holders: [],
              updatedAt: new Date().toISOString(),
            });
            comparisonCached.add(
              `${task.tokenAddress.toLowerCase()}-${task.chain}`
            );
          })
        );
      }
    }

    // Remaining unknowns default to standard (not cached — re-checked next run)
    const uncheckedDefaults = new Set();
    for (const t of unknownTasks) {
      if (t.tokenType === 'unknown') {
        t.tokenType = 'standard';
        uncheckedDefaults.add(`${t.tokenAddress.toLowerCase()}-${t.chain}`);
      }
    }

    if (uncheckedDefaults.size > 0) {
      console.log(`[CLASSIFY] ${uncheckedDefaults.size} tokens defaulted to standard (will retry next run)`);
    }

    // Cache ABI-classified tokens
    const toCache = unclassifiedTasks.filter((task) => {
      const key = `${task.tokenAddress.toLowerCase()}-${task.chain}`;
      return !comparisonCached.has(key) && !uncheckedDefaults.has(key);
    });
    if (toCache.length > 0) {
      await Promise.allSettled(
        toCache.map(async (task) => {
          await saveHolderCache(task.tokenAddress, task.chain, {
            token: task.tokenAddress,
            chain: task.chain,
            tokenType: task.tokenType,
            lastBlock: 0,
            holderCount: 0,
            holders: [],
            updatedAt: new Date().toISOString(),
          });
        })
      );
      console.log(`[CLASSIFY] Cached classification for ${toCache.length} tokens`);
    }
  }

  // Split into standard vs flagged
  const needsRebase = (type) =>
    ['share_based', 'true_rebase', 'needs_rebase'].includes(type);

  const standardTasks = tasks.filter((t) => !needsRebase(t.tokenType));
  const flaggedTasks = tasks.filter((t) => needsRebase(t.tokenType));

  console.log(
    `[CLASSIFY] ${standardTasks.length} standard, ${flaggedTasks.length} flagged [${elapsed(classifyStart)}]`
  );

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let success = 0;
  let failed = 0;
  let skipped = 0;
  let s3Saves = 0;
  let s3Errors = 0;
  let dbInserts = 0;

  async function fetchTotalSupplyForBatch(batch) {
    const chainGroups = {};
    for (const t of batch) {
      if (!chainGroups[t.chain]) chainGroups[t.chain] = [];
      chainGroups[t.chain].push(t);
    }
    const totalSupplyMap = {};
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
          const result = await sdk.api.abi.multiCall({
            abi: 'erc20:totalSupply',
            calls,
            chain,
            permitFailure: true,
          });
          for (const item of result.output) {
            if (item.output) {
              totalSupplyMap[`${item.input.target.toLowerCase()}-${chain}`] =
                BigInt(item.output);
            }
          }
        } catch (err) {
          console.log(`[ERROR] totalSupply failed for ${chain}: ${err.message}`);
        }
      })
    );
    return totalSupplyMap;
  }

  async function processBatch(batch, processFn) {
    const totalSupplyMap = await fetchTotalSupplyForBatch(batch);

    const batchPayloads = [];
    const results = await Promise.allSettled(
      batch.map((t) => processFn(t, totalSupplyMap, today))
    );

    for (let j = 0; j < results.length; j++) {
      const r = results[j];
      const t = batch[j];
      if (r.status === 'fulfilled') {
        if (r.value) {
          batchPayloads.push(r.value);
          success++;
          console.log(`  ✓ ${t.tokenAddress} on ${t.chain} — ${r.value.holderCount} holders`);
        } else {
          skipped++;
          console.log(`  ⊘ ${t.tokenAddress} on ${t.chain} — skipped (null result)`);
        }
      } else {
        failed++;
        console.log(`  ✗ ${t.tokenAddress} on ${t.chain} — FAILED: ${r.reason?.message || r.reason}`);
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
              holders: c.holders.map((h) => ({
                address: h.address,
                balance: String(h.balance),
              })),
              updatedAt: new Date().toISOString(),
            });
            s3Saves++;
          } catch (err) {
            s3Errors++;
            console.log(`[S3-ERROR] ${c.tokenAddress} on ${c.chain}: ${err.message}`);
          }
        })
      );
    }
    for (const p of batchPayloads) delete p._holderCache;

    // DB write
    if (batchPayloads.length > 0) {
      try {
        await insertHolder(batchPayloads);
        dbInserts += batchPayloads.length;
      } catch (err) {
        console.log(`[DB-ERROR] Batch insert failed: ${err.message}`);
        failed += batchPayloads.length;
        success -= batchPayloads.length;
      }
    }

    return batchPayloads.length;
  }

  // ── Standard Processing ──
  if (standardTasks.length > 0) {
    const standardStart = Date.now();
    const totalBatches = Math.ceil(standardTasks.length / BATCH_SIZE);
    console.log(`[STANDARD] Processing ${standardTasks.length} pools in ${totalBatches} batches`);

    for (let i = 0; i < standardTasks.length; i += BATCH_SIZE) {
      const batchNum = Math.floor(i / BATCH_SIZE) + 1;
      const batchStart = Date.now();
      const inserted = await processBatch(standardTasks.slice(i, i + BATCH_SIZE), processPool);
      const pct = ((Math.min(i + BATCH_SIZE, standardTasks.length) / standardTasks.length) * 100).toFixed(1);
      console.log(`[STANDARD] Batch ${batchNum}/${totalBatches}: ${inserted} inserted (${pct}%) [${elapsed(batchStart)}]`);
      if (i + BATCH_SIZE < standardTasks.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    console.log(`[STANDARD] Done [${elapsed(standardStart)}]`);
  }

  // ── Flagged Processing ──
  let seedCount = 0;

  if (flaggedTasks.length > 0) {
    const flaggedStart = Date.now();
    const totalBatches = Math.ceil(flaggedTasks.length / FLAGGED_BATCH_SIZE);
    let incrementalCount = 0;
    let cachedCount = 0;
    let uncachedCount = 0;
    console.log(`[FLAGGED] Processing ${flaggedTasks.length} pools in ${totalBatches} batches`);

    for (let i = 0; i < flaggedTasks.length; i += FLAGGED_BATCH_SIZE) {
      const batchNum = Math.floor(i / FLAGGED_BATCH_SIZE) + 1;
      const batchStart = Date.now();
      const batch = flaggedTasks.slice(i, i + FLAGGED_BATCH_SIZE);

      const batchInfo = await Promise.all(
        batch.map(async (task) => {
          const cache = await loadHolderCache(task.tokenAddress, task.chain);
          const hasHolderData =
            cache && cache.holders && cache.holders.length > 0;
          return { task, hasHolderData };
        })
      );

      const cached = batchInfo.filter((b) => b.hasHolderData).map((b) => b.task);
      if (cached.length > 0) {
        await processBatch(cached, processFlaggedPoolIncremental);
        incrementalCount += cached.length;
        cachedCount += cached.length;
      }

      const uncached = batchInfo
        .filter((b) => !b.hasHolderData)
        .map((b) => b.task);
      uncachedCount += uncached.length;
      const toSeed = uncached.slice(0, Math.max(0, MAX_SEED_PER_RUN - seedCount));
      if (toSeed.length > 0) {
        await processBatch(toSeed, seedFlaggedPool);
        seedCount += toSeed.length;
      }

      const overflowCount = uncached.length - toSeed.length;
      if (overflowCount > 0) {
        skipped += overflowCount;
      }

      const pct = ((Math.min(i + FLAGGED_BATCH_SIZE, flaggedTasks.length) / flaggedTasks.length) * 100).toFixed(1);
      console.log(
        `[FLAGGED] Batch ${batchNum}/${totalBatches}: ${cached.length} incremental, ${toSeed.length} seed` +
        `${overflowCount > 0 ? `, ${overflowCount} skipped` : ''} (${pct}%) [${elapsed(batchStart)}]`
      );

      if (i + FLAGGED_BATCH_SIZE < flaggedTasks.length) {
        await new Promise((r) => setTimeout(r, BATCH_DELAY_MS));
      }
    }

    console.log(
      `[FLAGGED] Done: ${incrementalCount} incremental, ${seedCount} seeded, ${uncachedCount - seedCount} skipped (cap) [${elapsed(flaggedStart)}]`
    );
  }

  // ── Summary ──
  console.log('═══ SUMMARY ═══');
  console.log(`Pools:    ${success} success, ${failed} failed, ${skipped} skipped / ${tasks.length} total`);
  console.log(`Split:    ${standardTasks.length} standard, ${flaggedTasks.length} flagged (${seedCount} seeded)`);
  console.log(`DB:       ${dbInserts} inserts`);
  console.log(`S3:       ${s3Saves} saves, ${s3Errors} errors`);
  console.log(`Time:     ${elapsed(startTime)}`);
};

function buildResult(
  holders,
  holderCount,
  configID,
  tvlUsd,
  totalSupplyMap,
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
  let top10Pct = null;
  let top10Holders = null;

  if (totalSupply && totalSupply > 0n) {
    const top10 = holders.slice(0, 10);
    const top10Balance = top10.reduce((sum, h) => sum + h.balance, 0n);
    top10Pct = Number((top10Balance * 10000n) / totalSupply) / 100;
    top10Holders = top10.map((h) => ({
      address: h.address,
      balance: String(h.balance),
      balancePct: Number((h.balance * 10000n) / totalSupply) / 100,
    }));
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

// Standard pool — no rebase needed
async function processPool(task, totalSupplyMap, today) {
  const { configID, chain, chainId, tokenAddress, tvlUsd } = task;

  let data;
  try {
    data = await fetchHolders(chainId, tokenAddress, 10, false);
  } catch (err) {
    // Peluche error — try ANKR fallback
    try {
      const ankrData = await getAnkrTopHolders(tokenAddress, chain, 15);
      if (ankrData && ankrData.holdersCount > 0) {
        return buildResult(
          ankrData.holders,
          ankrData.holdersCount,
          configID,
          tvlUsd,
          totalSupplyMap,
          chain,
          tokenAddress,
          today
        );
      }
    } catch (ankrErr) {
      console.log(
        `ANKR fallback failed for ${tokenAddress} on ${chain}: ${ankrErr.message}`
      );
    }
    return null;
  }

  const holderCount = data.total_holders;

  if (holderCount == null) {
    try {
      const ankrData = await getAnkrTopHolders(tokenAddress, chain, 15);
      if (ankrData && ankrData.holdersCount > 0) {
        return buildResult(
          ankrData.holders,
          ankrData.holdersCount,
          configID,
          tvlUsd,
          totalSupplyMap,
          chain,
          tokenAddress,
          today
        );
      }
    } catch (err) {
      console.log(
        `ANKR fallback failed for ${tokenAddress} on ${chain}: ${err.message}`
      );
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

  const topEntries = data.holders || data.deltas || [];
  if (
    topEntries.length > 0 &&
    totalSupply &&
    totalSupply > 0n
  ) {
    const top10Balance = topEntries.reduce(
      (sum, d) => sum + BigInt(d.balance || d.delta || d.amount || 0),
      0n
    );
    top10Pct = Number((top10Balance * 10000n) / totalSupply) / 100;

    top10Holders = topEntries.map((d) => ({
      address: d.holder || d.address || d.owner,
      balance: String(d.balance || d.delta || d.amount || 0),
      balancePct:
        totalSupply > 0n
          ? Number(
              (BigInt(d.balance || d.delta || d.amount || 0) * 10000n) /
                totalSupply
            ) / 100
          : 0,
    }));
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

// Flagged pool seed — one-time full rebase=true fetch
async function seedFlaggedPool(task, totalSupplyMap, today) {
  const { configID, chain, chainId, tokenAddress, tvlUsd } = task;

  try {
    // Pre-check holder count — high-holder tokens will timeout on Peluche rebase=true
    const preview = await fetchHolders(chainId, tokenAddress, 1, false);
    if (preview.total_holders > HIGH_HOLDER_THRESHOLD) {
      console.log(`  [FALLBACK] ${tokenAddress} on ${chain}: ${preview.total_holders} holders → ANKR (no S3 cache)`);
      const ankrData = await getAnkrTopHolders(tokenAddress, chain, 15);
      if (ankrData && ankrData.holders.length > 0) {
        return buildResult(
          ankrData.holders,
          ankrData.holdersCount,
          configID,
          tvlUsd,
          totalSupplyMap,
          chain,
          tokenAddress,
          today
        );
      }
      console.log(`  [FALLBACK] ${tokenAddress} on ${chain}: ANKR failed → on-chain fallback`);
      return processShareBasedPool(task, totalSupplyMap, today);
    }

    const data = await fetchHolders(chainId, tokenAddress, 100000000000, true);
    const entries = data.holders || data.deltas || [];
    if (entries.length === 0) {
      console.log(`  [FALLBACK] ${tokenAddress} on ${chain}: empty rebase=true → standard fallback (no S3 cache)`);
      return processPool(task, totalSupplyMap, today);
    }

    const holders = entries
      .filter((d) => d.holder)
      .map((d) => ({
        address: d.holder.toLowerCase(),
        balance: BigInt(d.balance || d.delta || 0),
      }))
      .filter((h) => h.balance > 0n)
      .sort((a, b) =>
        b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0
      );

    if (holders.length === 0) {
      console.log(`  [FALLBACK] ${tokenAddress} on ${chain}: no valid holders → standard fallback (no S3 cache)`);
      return processPool(task, totalSupplyMap, today);
    }

    const holderCount = holders.length;

    const result = buildResult(
      holders,
      holderCount,
      configID,
      tvlUsd,
      totalSupplyMap,
      chain,
      tokenAddress,
      today
    );

    // Attach holder cache data — S3 save happens in processBatch
    result._holderCache = {
      tokenAddress,
      chain,
      holders,
      holderCount,
      tokenType: task.tokenType,
      currentBlock: data.to_block,
    };

    return result;
  } catch (err) {
    console.log(`  [FALLBACK] ${tokenAddress} on ${chain}: seed failed (${err.message}) → on-chain fallback`);
    return processShareBasedPool(task, totalSupplyMap, today);
  }
}

// Flagged pool incremental — daily snapshot from last cached block
async function processFlaggedPoolIncremental(task, totalSupplyMap, today) {
  const { configID, chain, chainId, tokenAddress, tvlUsd } = task;

  // Chains without snapshot support — always do a full seed
  if (NO_SNAPSHOT_CHAINS.has(chain)) {
    return seedFlaggedPool(task, totalSupplyMap, today);
  }

  try {
    const cache = await loadHolderCache(tokenAddress, chain);
    if (!cache || !cache.holders || cache.holders.length === 0) {
      return seedFlaggedPool(task, totalSupplyMap, today);
    }

    // snapshot=true returns current balances for all addresses with activity
    // since from_block, including balance=0 for exited holders
    const data = await fetchHolders(
      chainId,
      tokenAddress,
      100000000000,
      true,
      cache.lastBlock,
      true
    );

    const toBlock = data.to_block;
    const entries = data.holders || data.deltas || [];

    // Build holder map from cache
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
    // (balances drift without transfers — snapshot only covers addresses with activity)
    if (cache.tokenType === 'true_rebase') {
      const topCached = cache.holders
        .slice(0, TOP_N_RECHECK)
        .map((h) => h.address.toLowerCase());
      const toRecheck = topCached.filter((addr) => !activeAddrs.has(addr));
      if (toRecheck.length > 0) {
        const refined = await refineHoldersOnChain(
          tokenAddress,
          toRecheck,
          chain
        );
        for (const addr of toRecheck) holderMap.delete(addr);
        for (const h of refined)
          holderMap.set(h.address.toLowerCase(), h.balance);
      }
    }

    const holders = Array.from(holderMap.entries())
      .map(([address, balance]) => ({ address, balance }))
      .sort((a, b) =>
        b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0
      );

    const holderCount = holders.length;

    const result = buildResult(
      holders,
      holderCount,
      configID,
      tvlUsd,
      totalSupplyMap,
      chain,
      tokenAddress,
      today
    );

    // Attach holder cache data — S3 save happens in processBatch
    result._holderCache = {
      tokenAddress,
      chain,
      holders,
      holderCount,
      tokenType: cache.tokenType,
      currentBlock: toBlock,
    };

    return result;
  } catch (err) {
    console.log(`  [FALLBACK] ${tokenAddress} on ${chain}: incremental failed (${err.message}) → on-chain fallback`);
    return processShareBasedPool(task, totalSupplyMap, today);
  }
}

// Fallback — on-chain balanceOf refinement
async function processShareBasedPool(task, totalSupplyMap, today) {
  const { configID, chain, chainId, tokenAddress, tvlUsd } = task;

  try {
    const data = await fetchHolders(chainId, tokenAddress, 100000000000, false);
    const entries = data.holders || data.deltas || [];

    if (entries.length === 0) {
      return processPool(task, totalSupplyMap, today);
    }

    const addresses = entries
      .map((d) => d.holder || d.address || d.owner)
      .filter(Boolean);
    if (addresses.length === 0) {
      return processPool(task, totalSupplyMap, today);
    }

    const refined = await refineHoldersOnChain(tokenAddress, addresses, chain);
    const holderCount = refined.length;

    return buildResult(
      refined,
      holderCount,
      configID,
      tvlUsd,
      totalSupplyMap,
      chain,
      tokenAddress,
      today
    );
  } catch (err) {
    console.log(`  [FALLBACK] ${tokenAddress} on ${chain}: on-chain refinement failed (${err.message}) → standard fallback`);
    return processPool(task, totalSupplyMap, today);
  }
}
