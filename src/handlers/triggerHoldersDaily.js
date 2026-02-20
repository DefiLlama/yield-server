const {
  scanTransfers,
  deriveMetrics,
  getLatestBlock,
  parsePoolField,
} = require('../utils/holderScanner');
const {
  getAllHolderStates,
  getPoolsWithoutHolderState,
  insertHolder,
  upsertHolderState,
} = require('../queries/holder');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await main();
};

const main = async () => {
  console.log('START DAILY HOLDER UPDATE');

  // 1. Get all pools that already have holder state
  const pools = await getAllHolderStates();
  console.log(`${pools.length} pools with existing holder state`);

  // 2. Get current block per chain (dedupe chain lookups)
  const chainBlocks = {};
  const chains = [...new Set(pools.map((p) => parsePoolField(p.pool).chain))];
  await Promise.all(
    chains.map(async (chain) => {
      if (!chain) return;
      try {
        chainBlocks[chain] = await getLatestBlock(chain);
      } catch (e) {
        console.log(`Failed to get block for ${chain}: ${e.message}`);
      }
    })
  );

  // 3. Incremental update for each pool
  const now = new Date().toISOString();
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  for (const pool of pools) {
    try {
      const { tokenAddress, chain } = parsePoolField(pool.pool);
      if (!chain || !chainBlocks[chain]) {
        skipped++;
        continue;
      }

      const fromBlock = Number(pool.lastBlock) + 1;
      const toBlock = chainBlocks[chain];

      if (fromBlock >= toBlock) {
        skipped++;
        continue;
      }

      // Scan only new blocks
      const updatedMap = await scanTransfers(
        chain,
        tokenAddress,
        fromBlock,
        toBlock,
        pool.balanceMap
      );

      const metrics = deriveMetrics(updatedMap, pool.tvlUsd);

      // Store snapshot + updated state
      await insertHolder({
        configID: pool.configID,
        timestamp: now,
        holderCount: metrics.holderCount,
        avgPositionUsd: metrics.avgPositionUsd,
        top10Pct: metrics.top10Pct,
        top10Holders: JSON.stringify(metrics.top10Holders),
      });

      await upsertHolderState(pool.configID, toBlock, updatedMap);
      updated++;

      if (updated % 100 === 0) {
        console.log(`Progress: ${updated}/${pools.length} updated`);
      }
    } catch (e) {
      console.log(`Failed ${pool.configID}: ${e.message}`);
      failed++;
    }
  }

  console.log(
    `Daily update complete: ${updated} updated, ${skipped} skipped, ${failed} failed`
  );

  // 4. Process NEW pools that appeared since last backfill
  const newPools = await getPoolsWithoutHolderState();
  if (newPools.length > 0) {
    console.log(`${newPools.length} new pools found — queueing for backfill`);
    // New pools get full-scanned inline if count is small, or logged for manual backfill
    if (newPools.length <= 50) {
      for (const pool of newPools) {
        try {
          const { tokenAddress, chain } = parsePoolField(pool.pool);
          if (!chain || !chainBlocks[chain] || !tokenAddress.startsWith('0x'))
            continue;

          const toBlock = chainBlocks[chain];
          const balanceMap = await scanTransfers(chain, tokenAddress, 0, toBlock);
          const metrics = deriveMetrics(balanceMap, pool.tvlUsd);

          await insertHolder({
            configID: pool.configID,
            timestamp: now,
            holderCount: metrics.holderCount,
            avgPositionUsd: metrics.avgPositionUsd,
            top10Pct: metrics.top10Pct,
            top10Holders: JSON.stringify(metrics.top10Holders),
          });
          await upsertHolderState(pool.configID, toBlock, balanceMap);
        } catch (e) {
          console.log(`Failed new pool ${pool.configID}: ${e.message}`);
        }
      }
    } else {
      console.log(
        `Too many new pools (${newPools.length}), run triggerHoldersBackfill manually`
      );
    }
  }
};
