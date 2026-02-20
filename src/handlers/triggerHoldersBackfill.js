const SQS = require('aws-sdk/clients/sqs');

const { getPoolsWithoutHolderState } = require('../queries/holder');
const {
  parsePoolField,
  isValidEvmAddress,
  SUPPORTED_CHAINS,
} = require('../utils/holderScanner');

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

  // Build messages for batch sending
  const messages = [];

  for (const pool of pools) {
    const { tokenAddress, chain } = parsePoolField(pool.pool);

    // Skip unsupported chains
    if (!chain || !SUPPORTED_CHAINS.has(chain)) {
      skipped++;
      continue;
    }

    // Skip non-ERC20 pool identifiers (e.g., Solana base58 addresses, LP-style multi-addr)
    if (!isValidEvmAddress(tokenAddress)) {
      skipped++;
      continue;
    }

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
    const result = await sqs
      .sendMessageBatch({ QueueUrl: queueUrl, Entries: batch })
      .promise();
    if (result.Failed?.length > 0) {
      console.error(`SQS: ${result.Failed.length}/${batch.length} messages failed`,
        result.Failed.map(f => f.Id));
    }
    queued += result.Successful?.length || 0;
  }

  console.log(`Queued ${queued} tokens, skipped ${skipped}`);
  return { queued, skipped };
};
