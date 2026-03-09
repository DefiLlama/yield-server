const sdk = require('@defillama/sdk');

const {
  fetchHolders,
  parsePoolField,
  isValidEvmAddress,
  resolveChainId,
  isRebaseToken,
} = require('../utils/holderApi');
const { getEligiblePools, insertHolder } = require('../queries/holder');

const BATCH_SIZE = 25;
// Max chains to run totalSupply multicalls for in parallel.
const CHAIN_CONCURRENCY = 5;

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await main();
};

const main = async () => {
  const startTime = Date.now();
  console.log('START DAILY HOLDER PROCESSING');

  // 1. Get all pools with TVL >= $10k.
  // The `token` column is the receipt-token address from PR #2447's migration
  // (config.token). It is preferred over parsing the pool ID, which may contain
  // non-token addresses (contract addresses, Morpho uniqueKey hashes, etc.).
  const pools = await getEligiblePools();
  console.log(`Found ${pools.length} eligible pools`);

  // 2. Filter to valid EVM pools on supported chains and resolve chain IDs.
  //    Token address comes from config.token (receipt-token); chain from pool ID.
  const tasks = [];
  for (const pool of pools) {
    if (!pool.token || !isValidEvmAddress(pool.token)) continue;

    const { chain } = parsePoolField(pool.pool);
    if (!chain) continue;

    const chainId = resolveChainId(chain);
    if (chainId == null) continue;

    tasks.push({
      configID: pool.configID,
      chain,
      chainId,
      tokenAddress: pool.token,
      tvlUsd: pool.tvlUsd,
      isRebase: isRebaseToken(pool.token),
    });
  }

  console.log(
    `${tasks.length} valid EVM pools (${pools.length - tasks.length} filtered out)`
  );

  // 3. Batch totalSupply calls per chain for top10Pct denominator.
  //    Run up to CHAIN_CONCURRENCY chains in parallel.
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
          const calls = group.map((t) => ({
            target: t.tokenAddress,
            params: [],
          }));
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
          console.log(`totalSupply multicall failed for ${chain}: ${err.message}`);
        }
      })
    );
  }

  // 4. Process pools in batches with concurrency
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let success = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);
    const batchPayloads = [];
    const results = await Promise.allSettled(
      batch.map((t) => processPool(t, totalSupplyMap, today))
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

    // Batch insert all successful payloads for this batch
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

  console.log(
    `DONE: ${success} success, ${failed} failed, ${skipped} skipped out of ${tasks.length} pools (${Date.now() - startTime}ms)`
  );
};

// Process a single pool and return the insert payload (or null if skipped).
async function processPool(task, totalSupplyMap, today) {
  const { configID, chain, chainId, tokenAddress, tvlUsd, isRebase } = task;

  // Fetch holder data from external API
  const data = await fetchHolders(chainId, tokenAddress, 10, isRebase);
  const holderCount = data.total_holders;

  if (holderCount == null) return null;

  // Insert holderCount=0 with nulls for position/concentration data
  // to keep the time series continuous
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

  // Compute top10Pct from deltas + totalSupply
  let top10Pct = null;
  let top10Holders = null;
  const supplyKey = `${tokenAddress.toLowerCase()}-${chain}`;
  const totalSupply = totalSupplyMap[supplyKey];

  if (data.deltas && data.deltas.length > 0 && totalSupply && totalSupply > 0n) {
    const top10Balance = data.deltas.reduce(
      (sum, d) => sum + BigInt(d.balance || d.amount || 0),
      0n
    );
    top10Pct = Number((top10Balance * 10000n) / totalSupply) / 100;

    top10Holders = data.deltas.map((d) => ({
      address: d.address || d.owner,
      balance: String(d.balance || d.amount || 0),
      balancePct:
        totalSupply > 0n
          ? Number((BigInt(d.balance || d.amount || 0) * 10000n) / totalSupply) / 100
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
