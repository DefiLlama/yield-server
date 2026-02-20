const {
  scanTransfers,
  deriveMetrics,
  getLatestBlock,
} = require('../utils/holderScanner');
const {
  insertHolder,
  upsertHolderState,
  getHolderState,
} = require('../queries/holder');

// Minimum remaining time (ms) to start processing the next SQS message
const MIN_REMAINING_MS = 60_000;

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const failedMessageIds = [];

  for (const record of event.Records) {
    // Check remaining Lambda time before starting next message
    if (context.getRemainingTimeInMillis() < MIN_REMAINING_MS) {
      console.log(
        `Only ${context.getRemainingTimeInMillis()}ms remaining — returning remaining messages as failures for re-delivery`
      );
      failedMessageIds.push(record.messageId);
      continue;
    }

    try {
      const body = JSON.parse(record.body);
      await processToken(body);
    } catch (err) {
      console.log(`Failed to process: ${err.message}`, err);
      failedMessageIds.push(record.messageId);
    }
  }

  return {
    batchItemFailures: failedMessageIds.map((id) => ({
      itemIdentifier: id,
    })),
  };
};

async function processToken({ configID, chain, tokenAddress, tvlUsd }) {
  console.log(`Processing ${tokenAddress} on ${chain} (configID: ${configID})`);

  // Check for existing state to resume from (supports retry after partial scan)
  const existingState = await getHolderState(configID);
  const fromBlock = existingState ? Number(existingState.lastBlock) + 1 : 0;
  const existingMap = existingState?.balanceMap || {};

  if (fromBlock > 0) {
    console.log(`Resuming from block ${fromBlock} (${Object.keys(existingMap).length} existing holders)`);
  }

  const toBlock = await getLatestBlock(chain);

  if (fromBlock >= toBlock) {
    console.log(`${tokenAddress}: already up to date at block ${toBlock}`);
    return;
  }

  // Scan with intermediate checkpointing to preserve progress
  let lastCheckpointCount = 0;
  const balanceMap = await scanTransfers(
    chain,
    tokenAddress,
    fromBlock,
    toBlock,
    existingMap,
    // Checkpoint callback: persist intermediate state every 500k events
    async (intermediateMap, processedCount, currentBlock) => {
      if (processedCount - lastCheckpointCount >= 500_000) {
        console.log(`Checkpoint at ${processedCount} events, block ${currentBlock} — saving intermediate state`);
        try {
          await upsertHolderState(configID, currentBlock, intermediateMap);
          lastCheckpointCount = processedCount;
        } catch (e) {
          console.log(`Checkpoint save failed: ${e.message}`);
        }
      }
    }
  );

  // Skip pools with 0 holders (likely non-ERC20 / incompatible pool type)
  const holderCount = Object.keys(balanceMap).length;
  if (holderCount === 0) {
    console.log(`Skipping ${tokenAddress}: 0 holders detected (likely non-ERC20 pool)`);
    return;
  }

  console.log(`${tokenAddress}: ${holderCount} holders at block ${toBlock}`);

  const metrics = deriveMetrics(balanceMap, tvlUsd);

  // Store snapshot + state
  const now = new Date().toISOString();
  await insertHolder({
    configID,
    timestamp: now,
    holderCount: metrics.holderCount,
    avgPositionUsd: metrics.avgPositionUsd,
    top10Pct: metrics.top10Pct,
    top10Holders: JSON.stringify(metrics.top10Holders),
    medianPositionUsd: metrics.medianPositionUsd,
  });

  await upsertHolderState(configID, toBlock, balanceMap);

  console.log(
    `Done: ${tokenAddress} — ${metrics.holderCount} holders, top10: ${metrics.top10Pct}%`
  );
}
