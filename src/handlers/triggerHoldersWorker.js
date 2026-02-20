const {
  scanTransfers,
  deriveMetrics,
  getLatestBlock,
} = require('../utils/holderScanner');
const { insertHolder, upsertHolderState } = require('../queries/holder');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const failedMessageIds = [];

  for (const record of event.Records) {
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

  const toBlock = await getLatestBlock(chain);

  // Full history scan from block 0
  const balanceMap = await scanTransfers(chain, tokenAddress, 0, toBlock);

  const holderCount = Object.keys(balanceMap).length;
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
  });

  await upsertHolderState(configID, toBlock, balanceMap);

  console.log(
    `Done: ${tokenAddress} — ${metrics.holderCount} holders, top10: ${metrics.top10Pct}%`
  );
}
