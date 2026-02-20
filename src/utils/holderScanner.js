const sdk = require('@defillama/sdk');

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TRANSFER_ABI =
  'event Transfer(address indexed from, address indexed to, uint256 value)';
const ZERO_ADDR = '0x' + '0'.repeat(40);

// Chains supported by the DefiLlama SDK indexer
const SUPPORTED_CHAINS = new Set([
  'ethereum', 'optimism', 'bsc', 'polygon', 'arbitrum', 'base',
  'avalanche', 'fantom', 'gnosis', 'linea', 'blast', 'scroll',
  'sonic', 'hyperliquid', 'monad', 'megaeth', 'berachain', 'unichain',
  'celo', 'moonbeam', 'moonriver', 'aurora', 'harmony',
  'polygon_zkevm',
]);

// Update a balance map in-place with a single transfer
function applyTransfer(balances, from, to, value) {
  from = from.toLowerCase();
  to = to.toLowerCase();
  const val = BigInt(value);

  if (from !== ZERO_ADDR) {
    const prev = balances[from] ? BigInt(balances[from]) : 0n;
    const next = prev - val;
    if (next < 0n) {
      console.log(`Warning: negative balance for ${from} (prev=${prev}, val=${val}) — removing entry`);
      delete balances[from];
    } else if (next === 0n) {
      delete balances[from];
    } else {
      balances[from] = next.toString();
    }
  }
  if (to !== ZERO_ADDR) {
    const prev = balances[to] ? BigInt(balances[to]) : 0n;
    balances[to] = (prev + val).toString();
  }
}

// Scan transfer events for a token using the indexer streaming path.
// If streaming fails, we fail fast rather than attempting an unbounded
// in-memory fallback that would OOM on large tokens. The SQS retry
// mechanism will re-attempt if the indexer recovers.
async function scanTransfers(chain, tokenAddress, fromBlock, toBlock, existingMap = {}, onCheckpoint) {
  const balances = {};
  // Copy existing map (values are strings so shallow copy is fine)
  for (const [k, v] of Object.entries(existingMap)) {
    balances[k] = v;
  }

  const baseOpts = {
    chain,
    target: tokenAddress,
    topic: TRANSFER_TOPIC,
    eventAbi: TRANSFER_ABI,
    fromBlock,
    toBlock,
  };

  let processedCount = 0;
  let lastSeenBlock = fromBlock;
  const CHECKPOINT_INTERVAL = 500_000;

  await sdk.indexer.getLogs({
    ...baseOpts,
    all: true,
    clientStreaming: true,
    collect: false,
    processor: (logs) => {
      for (const log of logs) {
        const args = log.args || log;
        applyTransfer(balances, args.from, args.to, args.value);
        processedCount++;
        if (log.blockNumber != null) lastSeenBlock = log.blockNumber;
      }
      // Intermediate checkpoint callback for long-running scans
      if (onCheckpoint && processedCount % CHECKPOINT_INTERVAL < logs.length) {
        onCheckpoint(balances, processedCount, lastSeenBlock);
      }
    },
  });

  return balances;
}

// Derive holder metrics from a balance map.
// Uses a min-heap approach to find top 10 in O(n) instead of sorting all entries.
function deriveMetrics(balanceMap, tvlUsd) {
  const entries = Object.entries(balanceMap);
  const holderCount = entries.length;
  const avgPositionUsd = holderCount > 0 ? tvlUsd / holderCount : null;

  // Find top 10 without full sort — O(n) instead of O(n log n)
  let totalBalance = 0n;
  const top10 = [];
  for (const [addr, bal] of entries) {
    const balance = BigInt(bal);
    totalBalance += balance;

    if (top10.length < 10) {
      top10.push({ address: addr, balance });
      // Keep sorted ascending so top10[0] is the smallest
      if (top10.length === 10) {
        top10.sort((a, b) => (a.balance > b.balance ? 1 : -1));
      }
    } else if (balance > top10[0].balance) {
      top10[0] = { address: addr, balance };
      // Re-sort to maintain min at index 0
      top10.sort((a, b) => (a.balance > b.balance ? 1 : -1));
    }
  }

  // Sort top10 descending for output
  top10.sort((a, b) => (b.balance > a.balance ? 1 : -1));

  const top10Balance = top10.reduce((s, e) => s + e.balance, 0n);
  const top10Pct =
    totalBalance > 0n
      ? Number((top10Balance * 10000n) / totalBalance) / 100
      : null;

  const top10Holders = top10.map((e) => ({
    address: e.address,
    balance: e.balance.toString(),
    balancePct:
      totalBalance > 0n
        ? Number((e.balance * 10000n) / totalBalance) / 100
        : 0,
  }));

  // Compute median position in USD
  let medianPositionUsd = null;
  if (holderCount > 0 && totalBalance > 0n) {
    const pricePerToken = tvlUsd / Number(totalBalance);
    const usdValues = entries.map(([, bal]) => Number(BigInt(bal)) * pricePerToken);
    usdValues.sort((a, b) => a - b);
    const mid = Math.floor(usdValues.length / 2);
    medianPositionUsd = usdValues.length % 2 === 0
      ? (usdValues[mid - 1] + usdValues[mid]) / 2
      : usdValues[mid];
  }

  return { holderCount, avgPositionUsd, top10Pct, top10Holders, medianPositionUsd };
}

// Get current block for a chain
async function getLatestBlock(chain) {
  const block = await sdk.blocks.getLatestBlock(chain);
  return block.number;
}

// Validate that a token address looks like a valid EVM address (0x + 40 hex chars = 42 chars)
function isValidEvmAddress(address) {
  return address.startsWith('0x') && address.length === 42;
}

// Extract token address and chain from pool field format: `${address}-${chain}`
function parsePoolField(pool) {
  // Pool format: "0xaddr-chain" — split on last hyphen group that matches a chain name
  // But the address itself can't contain hyphens, so we split from the right
  const lastDash = pool.lastIndexOf('-');
  if (lastDash === -1) return { tokenAddress: pool, chain: null };

  // Check if what's after the last dash is a chain name or part of the address
  // Addresses are 42 chars (0x + 40 hex), so if the prefix is exactly 42 chars it's the split
  const prefix = pool.substring(0, lastDash);
  const suffix = pool.substring(lastDash + 1);

  // Some pools have format like "0xaddr-0xaddr2-chain" for LP tokens
  // The chain is always the last segment
  // Simple heuristic: if suffix starts with 0x, it's not a chain
  if (suffix.startsWith('0x')) {
    return { tokenAddress: pool, chain: null };
  }

  return { tokenAddress: prefix, chain: suffix };
}

module.exports = {
  scanTransfers,
  deriveMetrics,
  getLatestBlock,
  parsePoolField,
  applyTransfer,
  isValidEvmAddress,
  SUPPORTED_CHAINS,
  TRANSFER_TOPIC,
  TRANSFER_ABI,
  ZERO_ADDR,
};
