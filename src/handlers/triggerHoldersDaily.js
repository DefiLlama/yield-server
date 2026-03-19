const sdk = require('@defillama/sdk');

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
const CHAIN_CONCURRENCY = 5;
const MAX_SEED_PER_RUN = 75;
const CLASSIFY_BATCH_SIZE = 500;
const TOP_N_RECHECK = 100;

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await main();
};

const main = async () => {
  const startTime = Date.now();
  console.log('START DAILY HOLDER PROCESSING');

  const pools = await getEligiblePools();
  console.log(`Found ${pools.length} eligible pools`);

  const tasks = [];
  for (const pool of pools) {
    if (!pool.token || !isValidEvmAddress(pool.token)) continue;
    if (!pool.chain) continue;

    const chainId = resolveChainId(pool.chain);
    if (chainId == null) continue;

    tasks.push({
      configID: pool.configID,
      chain: pool.chain,
      chainId,
      tokenAddress: pool.token,
      tvlUsd: pool.tvlUsd,
    });
  }

  console.log(
    `${tasks.length} valid EVM pools (${
      pools.length - tasks.length
    } filtered out)`
  );

  // Batch totalSupply per chain for top10Pct
  const chainGroups = {};
  for (const t of tasks) {
    if (!chainGroups[t.chain]) chainGroups[t.chain] = [];
    chainGroups[t.chain].push(t);
  }

  const totalSupplyMap = {};
  const chainEntries = Object.entries(chainGroups);

  for (let i = 0; i < chainEntries.length; i += CHAIN_CONCURRENCY) {
    const chunk = chainEntries.slice(i, i + CHAIN_CONCURRENCY);
    await Promise.allSettled(
      chunk.map(async ([chain, group]) => {
        try {
          const seen = new Set();
          const calls = [];
          for (const t of group) {
            const key = t.tokenAddress.toLowerCase();
            if (seen.has(key)) continue;
            seen.add(key);
            calls.push({ target: t.tokenAddress, params: [] });
          }
          const result = await sdk.api.abi.multiCall({
            abi: 'erc20:totalSupply',
            calls,
            chain,
          });
          for (const item of result.output) {
            if (item.output) {
              totalSupplyMap[`${item.input.target.toLowerCase()}-${chain}`] =
                BigInt(item.output);
            }
          }
        } catch (err) {
          console.log(
            `totalSupply multicall failed for ${chain}: ${err.message}`
          );
        }
      })
    );
  }

  // Load cached classifications from S3
  const cacheResults = await Promise.allSettled(
    tasks.map(async (task) => {
      const cache = await loadHolderCache(task.tokenAddress, task.chain);
      return { task, cache };
    })
  );

  for (const r of cacheResults) {
    if (r.status !== 'fulfilled' || !r.value) continue;
    r.value.task.tokenType = r.value.cache?.tokenType ?? null;
  }

  // Classify unclassified tokens via on-chain interface probing
  const unclassifiedTasks = tasks.filter((t) => t.tokenType == null);
  if (unclassifiedTasks.length > 0) {
    console.log(`Classifying ${unclassifiedTasks.length} unclassified tokens`);
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
      console.log(
        `Running llamao holders API comparison for ${toCompare.length} unknown tokens`
      );
      for (let i = 0; i < toCompare.length; i += COMPARE_CONCURRENCY) {
        const batch = toCompare.slice(i, i + COMPARE_CONCURRENCY);
        await Promise.allSettled(
          batch.map(async (task) => {
            const result = await classifyByComparison(
              task.chainId,
              task.tokenAddress,
              task.chain
            );
            if (result == null) return; // error — leave as unknown, don't cache
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

    // Remaining unknowns that weren't comparison-checked default to standard
    // but are NOT cached — they'll be re-checked on future runs
    const uncheckedDefaults = new Set();
    for (const t of unknownTasks) {
      if (t.tokenType === 'unknown') {
        t.tokenType = 'standard';
        uncheckedDefaults.add(`${t.tokenAddress.toLowerCase()}-${t.chain}`);
      }
    }

    if (uncheckedDefaults.size > 0) {
      console.log(
        `${uncheckedDefaults.size} tokens defaulted to standard without comparison check (will retry next run)`
      );
    }

    // Cache only tokens that were actually classified (skip comparison-cached and unchecked defaults)
    const toCache = unclassifiedTasks.filter((task) => {
      const key = `${task.tokenAddress.toLowerCase()}-${task.chain}`;
      return !comparisonCached.has(key) && !uncheckedDefaults.has(key);
    });
    console.log(`Caching classification for ${toCache.length} tokens`);
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
  }

  // Split into standard vs flagged
  const needsRebase = (type) =>
    ['share_based', 'true_rebase', 'needs_rebase'].includes(type);

  const standardTasks = tasks.filter((t) => !needsRebase(t.tokenType));
  const flaggedTasks = tasks.filter((t) => needsRebase(t.tokenType));

  console.log(
    `${standardTasks.length} standard, ${flaggedTasks.length} flagged (need rebase)`
  );

  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  async function processBatch(batch, processFn) {
    const batchPayloads = [];
    const results = await Promise.allSettled(
      batch.map((t) => processFn(t, totalSupplyMap, today))
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        if (r.value) {
          batchPayloads.push(r.value);
          success++;
        } else {
          skipped++;
        }
      } else {
        failed++;
        console.log(`Pool failed: ${r.reason?.message || r.reason}`);
      }
    }

    if (batchPayloads.length > 0) {
      try {
        await insertHolder(batchPayloads);
      } catch (err) {
        console.log(`Batch insert failed: ${err.message}`);
        failed += batchPayloads.length;
        success -= batchPayloads.length;
      }
    }
  }

  // Process standard pools
  for (let i = 0; i < standardTasks.length; i += BATCH_SIZE) {
    await processBatch(standardTasks.slice(i, i + BATCH_SIZE), processPool);
  }

  // Process flagged pools
  let seedCount = 0;

  for (let i = 0; i < flaggedTasks.length; i += FLAGGED_BATCH_SIZE) {
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
    }

    const uncached = batchInfo
      .filter((b) => !b.hasHolderData)
      .map((b) => b.task);
    const toSeed = uncached.slice(0, Math.max(0, MAX_SEED_PER_RUN - seedCount));
    if (toSeed.length > 0) {
      await processBatch(toSeed, seedFlaggedPool);
      seedCount += toSeed.length;
    }

    const overflowCount = uncached.length - toSeed.length;
    if (overflowCount > 0) {
      skipped += overflowCount;
      console.log(
        `Skipping ${overflowCount} unseeded flagged pools (seed cap reached)`
      );
    }
  }

  console.log(
    `DONE: ${success} success, ${failed} failed, ${skipped} skipped out of ${tasks.length} pools ` +
      `(${standardTasks.length} standard, ${flaggedTasks.length} flagged, ${seedCount} seeded) ` +
      `(${Date.now() - startTime}ms)`
  );
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
      console.log(`ANKR fallback failed for ${tokenAddress} on ${chain}: ${ankrErr.message}`);
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
      console.log(`ANKR fallback failed for ${tokenAddress} on ${chain}: ${err.message}`);
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

  if (
    data.deltas &&
    data.deltas.length > 0 &&
    totalSupply &&
    totalSupply > 0n
  ) {
    const top10Balance = data.deltas.reduce(
      (sum, d) => sum + BigInt(d.delta || d.balance || d.amount || 0),
      0n
    );
    top10Pct = Number((top10Balance * 10000n) / totalSupply) / 100;

    top10Holders = data.deltas.map((d) => ({
      address: d.holder || d.address || d.owner,
      balance: String(d.delta || d.balance || d.amount || 0),
      balancePct:
        totalSupply > 0n
          ? Number(
              (BigInt(d.delta || d.balance || d.amount || 0) * 10000n) /
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
      console.log(
        `${tokenAddress} on ${chain}: ${preview.total_holders} holders, using ANKR fallback`
      );
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
      // ANKR unavailable — fall through to processShareBasedPool
      return processShareBasedPool(task, totalSupplyMap, today);
    }

    const data = await fetchHolders(chainId, tokenAddress, 100000000000, true);
    if (!data.deltas || data.deltas.length === 0) {
      return processPool(task, totalSupplyMap, today);
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
      return processPool(task, totalSupplyMap, today);
    }

    const holderCount = holders.length;

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

    return buildResult(
      holders,
      holderCount,
      configID,
      tvlUsd,
      totalSupplyMap,
      chain,
      tokenAddress,
      today
    );
  } catch (err) {
    console.log(`Seed failed for ${tokenAddress} on ${chain}: ${err.message}`);
    return processShareBasedPool(task, totalSupplyMap, today);
  }
}

// Flagged pool incremental — daily rebase=true + from_block
async function processFlaggedPoolIncremental(task, totalSupplyMap, today) {
  const { configID, chain, chainId, tokenAddress, tvlUsd } = task;

  try {
    const cache = await loadHolderCache(tokenAddress, chain);
    if (!cache || !cache.holders || cache.holders.length === 0) {
      return seedFlaggedPool(task, totalSupplyMap, today);
    }

    const currentBlock = await getCurrentBlock(chain);

    const data = await fetchHolders(
      chainId,
      tokenAddress,
      100000000000,
      true,
      cache.lastBlock
    );

    const activeHolders = (data.deltas || [])
      .filter((d) => d.holder && BigInt(d.delta || 0) > 0n)
      .map((d) => ({
        address: d.holder.toLowerCase(),
        balance: BigInt(d.delta),
      }));

    const holderMap = new Map();
    for (const h of cache.holders) {
      holderMap.set(h.address.toLowerCase(), BigInt(h.balance));
    }

    const activeSet = new Set();
    for (const h of activeHolders) {
      holderMap.set(h.address, h.balance);
      activeSet.add(h.address);
    }

    // Remove exited holders (in delta but not active)
    const allDeltaAddresses = new Set(
      (data.deltas || [])
        .map((d) => (d.holder || '').toLowerCase())
        .filter(Boolean)
    );
    for (const addr of allDeltaAddresses) {
      if (!activeSet.has(addr)) {
        holderMap.delete(addr);
      }
    }

    // True rebase: re-verify top N cached holders via balanceOf
    if (cache.tokenType === 'true_rebase') {
      const topCached = cache.holders
        .slice(0, TOP_N_RECHECK)
        .map((h) => h.address.toLowerCase());
      const toRecheck = topCached.filter((addr) => !activeSet.has(addr));
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

    await saveHolderCache(tokenAddress, chain, {
      token: tokenAddress,
      chain,
      lastBlock: currentBlock,
      tokenType: cache.tokenType,
      holderCount,
      holders: holders.map((h) => ({
        address: h.address,
        balance: String(h.balance),
      })),
      updatedAt: new Date().toISOString(),
    });

    return buildResult(
      holders,
      holderCount,
      configID,
      tvlUsd,
      totalSupplyMap,
      chain,
      tokenAddress,
      today
    );
  } catch (err) {
    console.log(
      `Incremental failed for ${tokenAddress} on ${chain}, falling back: ${err.message}`
    );
    return processShareBasedPool(task, totalSupplyMap, today);
  }
}

// Fallback — on-chain balanceOf refinement
async function processShareBasedPool(task, totalSupplyMap, today) {
  const { configID, chain, chainId, tokenAddress, tvlUsd } = task;

  try {
    const data = await fetchHolders(chainId, tokenAddress, 100000000000, false);

    if (!data.deltas || data.deltas.length === 0) {
      return processPool(task, totalSupplyMap, today);
    }

    const addresses = data.deltas
      .map((d) => d.address || d.owner)
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
    console.log(
      `Flagged refinement failed for ${tokenAddress} on ${chain}, falling back: ${err.message}`
    );
    return processPool(task, totalSupplyMap, today);
  }
}
