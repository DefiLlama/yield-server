const sdk = require('@defillama/sdk');
const axios = require('axios');
const { readFromS3, writeToS3 } = require('./s3');

const API_BASE = 'https://peluche2.llamao.fi/holders';
const RETRYABLE_CODES = new Set([429, 500, 502, 503, 504]);
const BALANCE_CHUNK_SIZE = 2000;
const CHUNK_CONCURRENCY = 10;

// S3 cache

const CACHE_BUCKET = process.env.BUCKET_DATA;
const CACHE_PREFIX = 'holders/cache';

async function loadHolderCache(tokenAddress, chain) {
  const key = `${CACHE_PREFIX}/${tokenAddress.toLowerCase()}-${chain}.json`;
  try {
    return await readFromS3(CACHE_BUCKET, key);
  } catch (err) {
    return null;
  }
}

async function saveHolderCache(tokenAddress, chain, data) {
  const key = `${CACHE_PREFIX}/${tokenAddress.toLowerCase()}-${chain}.json`;
  await writeToS3(CACHE_BUCKET, key, data);
}

// Token classification

const TRUE_REBASE_TOKENS = new Set([
  '0xae7ab96520de3a18e5e111b5eaab095312d7fe84', // stETH (Lido)
  '0x856c4efb76c1d1ae02e20ceb03a2a6a08b0b8dc3', // OETH (Origin)
  '0x2a8e1e676ec238d8a992307b495b45b3feaa5e86', // OUSD (Origin)
  '0xb1e25689d55734fd3fffc939c4c3eb52dff8a794', // OS (Origin Sonic)
  '0xdbfefd2e8460a6ee4955a68582f85708baea60a3', // superOETHb (Origin)
]);

const SHARE_BASED_ABIS = [
  'address:UNDERLYING_ASSET_ADDRESS', // aTokens
  'address:baseToken', // Compound comets
  'address:asset', // ERC4626 vaults
];

const REBASE_ABIS = [
  'uint256:rebasingCreditsPerToken', // Origin pattern
  'uint256:getTotalPooledEther', // Lido pattern
];

async function classifyToken(tokenAddress, chain) {
  if (TRUE_REBASE_TOKENS.has(tokenAddress.toLowerCase())) return 'true_rebase';

  const call = [{ target: tokenAddress, params: [] }];
  const ZERO = '0x0000000000000000000000000000000000000000';

  for (const abi of SHARE_BASED_ABIS) {
    try {
      const { output } = await sdk.api.abi.multiCall({
        abi,
        calls: call,
        chain,
        permitFailure: true,
      });
      if (output[0]?.output && output[0].output !== ZERO) return 'share_based';
    } catch {}
  }

  for (const abi of REBASE_ABIS) {
    try {
      const { output } = await sdk.api.abi.multiCall({
        abi,
        calls: call,
        chain,
        permitFailure: true,
      });
      if (output[0]?.output) return 'true_rebase';
    } catch {}
  }

  return 'unknown';
}

// Returns Map of `${token}-${chain}` → 'share_based' | 'true_rebase' | 'unknown'
async function classifyTokensBatch(tasks) {
  const results = new Map();
  const ZERO = '0x0000000000000000000000000000000000000000';

  for (const t of tasks) {
    if (TRUE_REBASE_TOKENS.has(t.tokenAddress.toLowerCase())) {
      results.set(`${t.tokenAddress.toLowerCase()}-${t.chain}`, 'true_rebase');
    }
  }

  const unclassified = tasks.filter(
    (t) => !results.has(`${t.tokenAddress.toLowerCase()}-${t.chain}`)
  );
  const byChain = {};
  for (const t of unclassified) {
    if (!byChain[t.chain]) byChain[t.chain] = [];
    byChain[t.chain].push(t);
  }

  const interfaces = [
    ...SHARE_BASED_ABIS.map((abi) => ({ abi, type: 'share_based' })),
    ...REBASE_ABIS.map((abi) => ({ abi, type: 'true_rebase' })),
  ];

  for (const [chain, group] of Object.entries(byChain)) {
    for (const iface of interfaces) {
      const toCheck = group.filter(
        (t) => !results.has(`${t.tokenAddress.toLowerCase()}-${chain}`)
      );
      if (toCheck.length === 0) continue;

      try {
        const { output } = await sdk.api.abi.multiCall({
          abi: iface.abi,
          calls: toCheck.map((t) => ({ target: t.tokenAddress, params: [] })),
          chain,
          permitFailure: true,
        });
        for (let i = 0; i < output.length; i++) {
          if (
            output[i]?.output &&
            output[i].output !== ZERO &&
            output[i].output !== '0'
          ) {
            results.set(
              `${toCheck[i].tokenAddress.toLowerCase()}-${chain}`,
              iface.type
            );
          }
        }
      } catch {}
    }

    for (const t of group) {
      const key = `${t.tokenAddress.toLowerCase()}-${chain}`;
      if (!results.has(key)) results.set(key, 'unknown');
    }
  }

  return results;
}

// ANKR comparison — fallback for tokens that can't be classified by interface

const ANKR_CHAIN_MAP = {
  ethereum: 'eth',
  arbitrum: 'arbitrum',
  avax: 'avalanche',
  base: 'base',
  bsc: 'bsc',
  fantom: 'fantom',
  xdai: 'gnosis',
  linea: 'linea',
  optimism: 'optimism',
  polygon: 'polygon',
  polygon_zkevm: 'polygon_zkevm',
  scroll: 'scroll',
};

async function getAnkrHolderCount(tokenAddress, chain) {
  const ankrChain = ANKR_CHAIN_MAP[chain];
  if (!ankrChain) return null;

  const ankrKey = process.env.ANKR_API_KEY;
  const ankrUrl = ankrKey
    ? `https://rpc.ankr.com/multichain/${ankrKey}`
    : 'https://rpc.ankr.com/multichain';
  const { data } = await axios.post(
    ankrUrl,
    {
      jsonrpc: '2.0',
      id: 1,
      method: 'ankr_getTokenHoldersCount',
      params: { blockchain: ankrChain, contractAddress: tokenAddress },
    },
    { timeout: 15000 }
  );
  return data?.result?.holderCount ?? data?.result?.holdersCount ?? null;
}

// Compares Peluche (no rebase) vs ANKR — >10% diff means token needs rebase
async function classifyByComparison(chainId, tokenAddress, chain) {
  try {
    const [pelucheData, ankrCount] = await Promise.all([
      fetchHolders(chainId, tokenAddress, 1, false),
      getAnkrHolderCount(tokenAddress, chain),
    ]);

    const pelucheCount = pelucheData.total_holders || 0;

    if (ankrCount == null || ankrCount === 0) return 'needs_rebase';
    if (pelucheCount === 0) return 'needs_rebase';

    const diff = Math.abs(pelucheCount - ankrCount) / Math.max(ankrCount, 1);
    return diff > 0.1 ? 'needs_rebase' : 'standard';
  } catch (err) {
    console.log(`ANKR comparison failed for ${tokenAddress} on ${chain}: ${err.message}`);
    return 'standard';
  }
}

// Block number

async function getCurrentBlock(chain) {
  const timestamp = Math.floor(Date.now() / 1000);
  const chainKey = chain === 'avalanche' ? 'avax' : chain;
  const { data } = await axios.get(
    `https://coins.llama.fi/block/${chainKey}/${timestamp}`
  );
  if (!data.height || typeof data.height !== 'number') {
    throw new Error(`Invalid block height for ${chain}: ${JSON.stringify(data)}`);
  }
  return data.height;
}

// On-chain balanceOf refinement

async function refineHoldersOnChain(tokenAddress, addresses, chain) {
  const chunks = [];
  for (let i = 0; i < addresses.length; i += BALANCE_CHUNK_SIZE) {
    chunks.push(addresses.slice(i, i + BALANCE_CHUNK_SIZE));
  }

  const results = [];

  for (let i = 0; i < chunks.length; i += CHUNK_CONCURRENCY) {
    const batch = chunks.slice(i, i + CHUNK_CONCURRENCY);
    const settled = await Promise.allSettled(
      batch.map(async (chunk) => {
        const { output } = await sdk.api.abi.multiCall({
          abi: 'erc20:balanceOf',
          calls: chunk.map((addr) => ({
            target: tokenAddress,
            params: [addr],
          })),
          chain,
          permitFailure: true,
        });
        return output;
      })
    );

    for (const r of settled) {
      if (r.status !== 'fulfilled' || !r.value) continue;
      for (const item of r.value) {
        const bal = BigInt(item.output || 0);
        if (bal > 0n) {
          results.push({ address: item.input.params[0], balance: bal });
        }
      }
    }
  }

  results.sort((a, b) =>
    b.balance > a.balance ? 1 : b.balance < a.balance ? -1 : 0
  );
  return results;
}

// Chain ID resolution

const { getChainKeyFromLabel } = sdk.chainUtils;

const CHAIN_NAME_TO_ID = {
  ethereum: 1,
  optimism: 10,
  bsc: 56,
  xdai: 100,
  unichain: 130,
  polygon: 137,
  sonic: 146,
  monad: 143,
  fantom: 250,
  era: 324,
  hyperliquid: 999,
  polygon_zkevm: 1101,
  soneium: 1868,
  megaeth: 4326,
  base: 8453,
  mode: 34443,
  arbitrum_nova: 42170,
  arbitrum: 42161,
  avax: 43114,
  linea: 59144,
  blast: 81457,
  berachain: 80094,
  op_bnb: 204,
  scroll: 534352,
};

const CHAIN_ALIASES = { hyperevm: 'hyperliquid' };

function resolveChainId(chain) {
  const key = getChainKeyFromLabel(CHAIN_ALIASES[chain] || chain);
  return CHAIN_NAME_TO_ID[key] ?? null;
}

// Peluche API

function getHeaders() {
  return process.env.HOLDERS_API_KEY
    ? { 'x-api-key': process.env.HOLDERS_API_KEY }
    : {};
}

async function fetchHolders(
  chainId,
  token,
  limit = 10,
  rebase = false,
  fromBlock = null
) {
  const params = new URLSearchParams({ chainId, token });
  if (limit != null) params.set('limit', limit);
  if (rebase) params.set('rebase', 'true');
  if (fromBlock) params.set('from_block', fromBlock);
  const url = `${API_BASE}?${params}`;
  const headers = getHeaders();

  try {
    return (await axios.get(url, { timeout: 30000, headers })).data;
  } catch (err) {
    const status = err.response?.status;
    if (status && RETRYABLE_CODES.has(status)) {
      await new Promise((r) => setTimeout(r, 2000));
      return (await axios.get(url, { timeout: 30000, headers })).data;
    }
    throw err;
  }
}

// Pool field parsing

function parsePoolField(pool) {
  const lastDash = pool.lastIndexOf('-');
  if (lastDash === -1) return { tokenAddress: pool, chain: null };

  const prefix = pool.substring(0, lastDash);
  const suffix = pool.substring(lastDash + 1);

  if (suffix.startsWith('0x')) {
    return { tokenAddress: pool, chain: null };
  }

  return { tokenAddress: prefix, chain: suffix };
}

function isValidEvmAddress(address) {
  return address.startsWith('0x') && address.length === 42;
}

module.exports = {
  fetchHolders,
  parsePoolField,
  isValidEvmAddress,
  resolveChainId,
  refineHoldersOnChain,
  loadHolderCache,
  saveHolderCache,
  classifyToken,
  classifyTokensBatch,
  classifyByComparison,
  getCurrentBlock,
};
