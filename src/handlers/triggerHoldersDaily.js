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

  try {
  // 1. Get all pools that already have holder state (without balanceMaps)
  const pools = await getAllHolderStates();
  console.log(`${pools.length} pools with existing holder state`);

  // 2. Pre-parse pool fields (avoids double-parsing later)
  const parsedPools = pools.map((p) => ({ ...p, ...parsePoolField(p.pool) }));

  // Get current block per chain (dedupe chain lookups)
  const chainBlocks = {};
  const chains = [...new Set(parsedPools.map((p) => p.chain).filter(Boolean))];
  await Promise.all(
    chains.map(async (chain) => {
      if (!SUPPORTED_CHAINS.has(chain)) return;
      try {
        chainBlocks[chain] = await getLatestBlock(chain);
      } catch (e) {
        console.log(`Failed to get block for ${chain}: ${e.message}`);
      }
    })
  );

  // 3. Incremental update with concurrency batching
  // Truncate to midnight UTC so the holder table has exactly 1 row per configID/day
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);
  const dayTimestamp = today.toISOString();
  let updated = 0;
  let skipped = 0;
  let failed = 0;

  // Process pools in batches of CONCURRENCY
  for (let i = 0; i < parsedPools.length; i += CONCURRENCY) {
    const batch = parsedPools.slice(i, i + CONCURRENCY);
    const results = await Promise.allSettled(
      batch.map(async (pool) => {
        const { tokenAddress, chain } = pool;
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
          timestamp: dayTimestamp,
          holderCount: metrics.holderCount,
          avgPositionUsd: metrics.avgPositionUsd,
          top10Pct: metrics.top10Pct,
          top10Holders: metrics.top10Holders,
          medianPositionUsd: metrics.medianPositionUsd,
        });

        await upsertHolderState(pool.configID, toBlock, updatedMap);
        return 'updated';
      })
    );

    for (let j = 0; j < results.length; j++) {
      const result = results[j];
      if (result.status === 'fulfilled') {
        if (result.value === 'updated') updated++;
        else skipped++;
      } else {
        const p = batch[j];
        console.log(`Failed ${p.tokenAddress} on ${p.chain} (${p.configID}): ${result.reason?.message}`);
        failed++;
      }
    }

    const total = updated + skipped + failed;
    if (total % (CONCURRENCY * 20) === 0 || i + CONCURRENCY >= parsedPools.length) {
      console.log(`Progress: ${total}/${parsedPools.length} (${updated} updated, ${skipped} skipped, ${failed} failed)`);
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
            console.log(`New pool ${tokenAddress}: 0 holders — marking processed`);
            await upsertHolderState(pool.configID, toBlock, {});
            continue;
          }

          const metrics = deriveMetrics(balanceMap, pool.tvlUsd);
          await insertHolder({
            configID: pool.configID,
            timestamp: dayTimestamp,
            holderCount: metrics.holderCount,
            avgPositionUsd: metrics.avgPositionUsd,
            top10Pct: metrics.top10Pct,
            top10Holders: metrics.top10Holders,
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
      let sqsQueued = 0;
      for (let i = 0; i < messages.length; i += 10) {
        const batch = messages.slice(i, i + 10);
        const result = await sqs
          .sendMessageBatch({ QueueUrl: queueUrl, Entries: batch })
          .promise();
        if (result.Failed?.length > 0) {
          console.error(`SQS: ${result.Failed.length}/${batch.length} messages failed`,
            result.Failed.map(f => f.Id));
        }
        sqsQueued += result.Successful?.length || 0;
      }
      console.log(`Queued ${sqsQueued}/${messages.length} new pools to SQS`);
    }
  }

  } catch (err) {
    console.error('DAILY HOLDER UPDATE FAILED:', err.message, err.stack);
    throw err;
  }
};
