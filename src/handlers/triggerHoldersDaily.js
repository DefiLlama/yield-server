const SQS = require('aws-sdk/clients/sqs');

const {
  scanTransfers,
  deriveMetrics,
  getLatestBlock,
  parsePoolField,
  isValidEvmAddress,
  SUPPORTED_CHAINS,
} = require('../utils/holderScanner');
const {
  getAllHolderStates,
  getPoolsWithoutHolderState,
  getHolderState,
  insertHolder,
  upsertHolderState,
} = require('../queries/holder');

const CONCURRENCY = 5;

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await main();
};

const main = async () => {
  console.log('START DAILY HOLDER UPDATE');

  // 1. Get all pools that already have holder state (without balanceMaps)
  const pools = await getAllHolderStates();
  console.log(`${pools.length} pools with existing holder state`);

  // 2. Get current block per chain (dedupe chain lookups)
  const chainBlocks = {};
  const chains = [...new Set(pools.map((p) => parsePoolField(p.pool).chain))];
  await Promise.all(
    chains.map(async (chain) => {
      if (!chain || !SUPPORTED_CHAINS.has(chain)) return;
      try {
        chainBlocks[chain] = await getLatestBlock(chain);
      } catch (e) {
        console.log(`Failed to get block for ${chain}: ${e.message}`);
      }
    })
  );

  // 3. Incremental update with concurrency batching
  const now = new Date().toISOString();
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  // Process pools in batches of CONCURRENCY
  for (let i = 0; i < pools.length; i += CONCURRENCY) {
    const batch = pools.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (pool) => {
        const { tokenAddress, chain } = parsePoolField(pool.pool);
        if (!chain || !chainBlocks[chain] || !SUPPORTED_CHAINS.has(chain)) {
          return 'skipped';
        }
        if (!isValidEvmAddress(tokenAddress)) {
          return 'skipped';
        }

        const fromBlock = Number(pool.lastBlock) + 1;
        const toBlock = chainBlocks[chain];

        if (fromBlock >= toBlock) {
          return 'skipped';
        }

        // Lazy-load this pool's balanceMap individually to avoid OOM
        const state = await getHolderState(pool.configID);
        const existingMap = state?.balanceMap || {};

        // Scan only new blocks
        const updatedMap = await scanTransfers(
          chain,
          tokenAddress,
          fromBlock,
          toBlock,
          existingMap
        );

        // Skip pools with 0 holders (likely non-ERC20 / incompatible pool type)
        if (Object.keys(updatedMap).length === 0) {
          console.log(`Skipping ${tokenAddress}: 0 holders (likely non-ERC20 pool)`);
          return 'skipped';
        }

        const metrics = deriveMetrics(updatedMap, pool.tvlUsd);

        // Store snapshot + updated state
        await insertHolder({
          configID: pool.configID,
          timestamp: now,
          holderCount: metrics.holderCount,
          avgPositionUsd: metrics.avgPositionUsd,
          top10Pct: metrics.top10Pct,
          top10Holders: JSON.stringify(metrics.top10Holders),
          medianPositionUsd: metrics.medianPositionUsd,
        });

        await upsertHolderState(pool.configID, toBlock, updatedMap);
        return 'updated';
      })
    );

    for (const result of results) {
      if (result.status === 'fulfilled') {
        if (result.value === 'updated') updated++;
        else skipped++;
      } else {
        console.log(`Failed: ${result.reason?.message}`);
        failed++;
      }
    }

    if (updated % 100 < CONCURRENCY && updated > 0) {
      console.log(`Progress: ${updated + skipped + failed}/${pools.length} processed (${updated} updated)`);
    }
  }

  console.log(
    `Daily update complete: ${updated} updated, ${skipped} skipped, ${failed} failed`
  );

  // 4. Process NEW pools — always queue to SQS
  const newPools = await getPoolsWithoutHolderState();
  if (newPools.length > 0) {
    console.log(`${newPools.length} new pools found`);

    const queueUrl = process.env.HOLDER_QUEUE_URL;
    if (!queueUrl) {
      console.log('HOLDER_QUEUE_URL not set — processing new pools inline (max 5)');
      // Fallback: process a small number inline
      for (const pool of newPools.slice(0, 5)) {
        try {
          const { tokenAddress, chain } = parsePoolField(pool.pool);
          if (!chain || !chainBlocks[chain] || !SUPPORTED_CHAINS.has(chain)) continue;
          if (!isValidEvmAddress(tokenAddress)) continue;

          const toBlock = chainBlocks[chain];
          const balanceMap = await scanTransfers(chain, tokenAddress, 0, toBlock);

          if (Object.keys(balanceMap).length === 0) {
            console.log(`Skipping new pool ${tokenAddress}: 0 holders`);
            continue;
          }

          const metrics = deriveMetrics(balanceMap, pool.tvlUsd);
          await insertHolder({
            configID: pool.configID,
            timestamp: now,
            holderCount: metrics.holderCount,
            avgPositionUsd: metrics.avgPositionUsd,
            top10Pct: metrics.top10Pct,
            top10Holders: JSON.stringify(metrics.top10Holders),
            medianPositionUsd: metrics.medianPositionUsd,
          });
          await upsertHolderState(pool.configID, toBlock, balanceMap);
        } catch (e) {
          console.log(`Failed new pool ${pool.configID}: ${e.message}`);
        }
      }
    } else {
      // Queue all new pools to SQS via sendMessageBatch
      const sqs = new SQS();
      const messages = [];

      for (const pool of newPools) {
        const { tokenAddress, chain } = parsePoolField(pool.pool);
        if (!chain || !SUPPORTED_CHAINS.has(chain)) continue;
        if (!isValidEvmAddress(tokenAddress)) continue;

        messages.push({
          Id: pool.configID.replace(/-/g, ''),
          MessageBody: JSON.stringify({
            configID: pool.configID,
            chain,
            tokenAddress,
            tvlUsd: pool.tvlUsd,
          }),
        });
      }

      // sendMessageBatch supports max 10 per call
      for (let i = 0; i < messages.length; i += 10) {
        const batch = messages.slice(i, i + 10);
        await sqs
          .sendMessageBatch({ QueueUrl: queueUrl, Entries: batch })
          .promise();
      }
      console.log(`Queued ${messages.length} new pools to SQS`);
    }
  }
};
