const sdk = require('@defillama/sdk');

const {
  fetchHolders,
  parsePoolField,
  isValidEvmAddress,
  resolveChainId,
} = require('../utils/holderApi');
const { getEligiblePools, insertHolder } = require('../queries/holder');

const BATCH_SIZE = 10;

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await main();
};

const main = async () => {
  console.log('START DAILY HOLDER PROCESSING');

  // 1. Get all pools with TVL >= $10k
  const pools = await getEligiblePools();
  console.log(`Found ${pools.length} eligible pools`);

  // 2. Filter to valid EVM pools on supported chains and resolve chain IDs
  const tasks = [];
  for (const pool of pools) {
    const { tokenAddress, chain } = parsePoolField(pool.pool);
    if (!chain) continue;
    if (!isValidEvmAddress(tokenAddress)) continue;
    const chainId = resolveChainId(chain);
    if (chainId == null) continue;

    tasks.push({
      configID: pool.configID,
      chain,
      chainId,
      tokenAddress,
      tvlUsd: pool.tvlUsd,
    });
  }

  console.log(
    `${tasks.length} valid EVM pools (${pools.length - tasks.length} filtered out)`
  );

  // 3. Batch totalSupply calls per chain for top10Pct denominator
  const chainGroups = {};
  for (const t of tasks) {
    if (!chainGroups[t.chain]) chainGroups[t.chain] = [];
    chainGroups[t.chain].push(t);
  }

  const totalSupplyMap = {};
  for (const [chain, group] of Object.entries(chainGroups)) {
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
  }

  // 4. Process pools in batches with concurrency
  const today = new Date();
  today.setUTCHours(0, 0, 0, 0);

  let success = 0;
  let failed = 0;

  for (let i = 0; i < tasks.length; i += BATCH_SIZE) {
    const batch = tasks.slice(i, i + BATCH_SIZE);
    const results = await Promise.allSettled(
      batch.map((t) => processPool(t, totalSupplyMap, today))
    );

    for (const r of results) {
      if (r.status === 'fulfilled') {
        success++;
      } else {
        failed++;
        console.log(`Pool failed: ${r.reason?.message || r.reason}`);
      }
    }
  }

  console.log(
    `DAILY HOLDER PROCESSING COMPLETE: ${success} success, ${failed} failed`
  );
};

async function processPool(task, totalSupplyMap, today) {
  const { configID, chain, chainId, tokenAddress, tvlUsd } = task;

  // Fetch holder data from external API
  const data = await fetchHolders(chainId, tokenAddress);
  const holderCount = data.total_holders;

  if (holderCount == null || holderCount === 0) return;

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

  await insertHolder({
    configID,
    timestamp: today.toISOString(),
    holderCount,
    avgPositionUsd,
    top10Pct,
    top10Holders,
  });
}
