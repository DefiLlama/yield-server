const sdk = require('@defillama/sdk');

const TRANSFER_TOPIC =
  '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TRANSFER_ABI =
  'event Transfer(address indexed from, address indexed to, uint256 value)';
const ZERO_ADDR = '0x' + '0'.repeat(40);
const STREAMING_THRESHOLD = 100_000;

// Update a balance map in-place with a single transfer
function applyTransfer(balances, from, to, value) {
  from = from.toLowerCase();
  to = to.toLowerCase();
  const val = BigInt(value);

  if (from !== ZERO_ADDR) {
    const prev = balances[from] ? BigInt(balances[from]) : 0n;
    const next = prev - val;
    if (next <= 0n) delete balances[from];
    else balances[from] = next.toString();
  }
  if (to !== ZERO_ADDR) {
    const prev = balances[to] ? BigInt(balances[to]) : 0n;
    balances[to] = (prev + val).toString();
  }
}

// Scan transfer events for a token.
// For small tokens (<100k events): fetches all at once.
// For large tokens: uses streaming processor to avoid OOM.
async function scanTransfers(chain, tokenAddress, fromBlock, toBlock, existingMap = {}) {
  const balances = {};
  // Deep-copy existing map (values are strings so shallow copy is fine)
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
    onlyArgs: true,
  };

  // Try streaming path first via indexer
  try {
    await sdk.indexer.getLogs({
      ...baseOpts,
      all: true,
      clientStreaming: true,
      collect: false,
      processor: (logs) => {
        for (const log of logs) {
          applyTransfer(balances, log.from, log.to, log.value);
        }
      },
    });
    return balances;
  } catch (e) {
    console.log(
      `Indexer streaming failed for ${tokenAddress} on ${chain}, falling back to getEventLogs: ${e.message}`
    );
  }

  // Fallback: standard getEventLogs (auto-paginates via SDK internals)
  const logs = await sdk.getEventLogs({
    ...baseOpts,
    flatten: true,
  });

  for (const log of logs) {
    applyTransfer(balances, log.from, log.to, log.value);
  }
  return balances;
}

// Derive holder metrics from a balance map
function deriveMetrics(balanceMap, tvlUsd) {
  const entries = Object.entries(balanceMap)
    .map(([addr, bal]) => ({ address: addr, balance: BigInt(bal) }))
    .sort((a, b) => (b.balance > a.balance ? 1 : -1));

  const holderCount = entries.length;
  const avgPositionUsd = holderCount > 0 ? tvlUsd / holderCount : null;

  const totalBalance = entries.reduce((s, e) => s + e.balance, 0n);
  const top10 = entries.slice(0, 10);
  const top10Balance = top10.reduce((s, e) => s + e.balance, 0n);
  const top10Pct =
    totalBalance > 0n
      ? Number((top10Balance * 10000n) / totalBalance) / 100
      : null;

  const top10Holders = top10.map((e) => ({
    address: e.address,
    balancePct:
      totalBalance > 0n
        ? Number((e.balance * 10000n) / totalBalance) / 100
        : 0,
  }));

  return { holderCount, avgPositionUsd, top10Pct, top10Holders };
}

// Get current block for a chain
async function getLatestBlock(chain) {
  const block = await sdk.blocks.getLatestBlock(chain);
  return block.number;
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
  TRANSFER_TOPIC,
  TRANSFER_ABI,
  ZERO_ADDR,
};
