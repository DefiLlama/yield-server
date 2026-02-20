const SQS = require('aws-sdk/clients/sqs');

const { getPoolsWithoutHolderState } = require('../queries/holder');
const { parsePoolField } = require('../utils/holderScanner');

// Chains supported by the DefiLlama SDK indexer
const SUPPORTED_CHAINS = new Set([
  'ethereum', 'optimism', 'bsc', 'polygon', 'arbitrum', 'base',
  'avalanche', 'fantom', 'gnosis', 'linea', 'blast', 'scroll',
  'sonic', 'hyperliquid', 'monad', 'megaeth', 'berachain', 'unichain',
  'celo', 'moonbeam', 'moonriver', 'aurora', 'harmony',
  'polygon_zkevm',
]);

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await main();
};

const main = async () => {
  console.log('START HOLDER BACKFILL');

  const sqs = new SQS();
  const queueUrl = process.env.HOLDER_QUEUE_URL;

  // Get all pools with TVL >= $10k that don't have holder state yet
  const pools = await getPoolsWithoutHolderState();
  console.log(`Found ${pools.length} pools without holder data`);

  let queued = 0;
  let skipped = 0;

  for (const pool of pools) {
    const { tokenAddress, chain } = parsePoolField(pool.pool);

    // Skip unsupported chains
    if (!chain || !SUPPORTED_CHAINS.has(chain)) {
      skipped++;
      continue;
    }

    // Skip non-ERC20 pool identifiers (e.g., Solana base58 addresses)
    if (!tokenAddress.startsWith('0x')) {
      skipped++;
      continue;
    }

    await sqs
      .sendMessage({
        QueueUrl: queueUrl,
        MessageBody: JSON.stringify({
          configID: pool.configID,
          chain,
          tokenAddress,
          tvlUsd: pool.tvlUsd,
        }),
      })
      .promise();

    queued++;
  }

  console.log(`Queued ${queued} tokens, skipped ${skipped}`);
  return { queued, skipped };
};
