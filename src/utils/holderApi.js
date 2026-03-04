const sdk = require('@defillama/sdk');
const superagent = require('superagent');

const API_BASE = 'https://peluche2.llamao.fi/holders';

const { getChainKeyFromLabel } = sdk.chainUtils;

// Chain name → numeric chain ID mapping (matches SDK indexer v2 set).
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

// Yield-server pool names that the SDK doesn't map correctly.
const CHAIN_ALIASES = {
  hyperevm: 'hyperliquid',
};

// Resolve a yield-server chain name to a numeric chain ID for the holders API.
// Returns null if the chain is unsupported.
function resolveChainId(chain) {
  const key = getChainKeyFromLabel(CHAIN_ALIASES[chain] || chain);
  return CHAIN_NAME_TO_ID[key] ?? null;
}

// Fetch holder data from the external API.
// Returns { total_holders, deltas } where deltas is an array of top-N holder entries.
async function fetchHolders(chainId, token, limit = 10) {
  const url = `${API_BASE}/${chainId}/${token}?limit=${limit}`;
  const res = await superagent.get(url).timeout({ response: 30000 });
  return res.body;
}

// Extract token address and chain from pool field format: `${address}-${chain}`
function parsePoolField(pool) {
  const lastDash = pool.lastIndexOf('-');
  if (lastDash === -1) return { tokenAddress: pool, chain: null };

  const prefix = pool.substring(0, lastDash);
  const suffix = pool.substring(lastDash + 1);

  // If suffix starts with 0x, it's part of the address, not a chain
  if (suffix.startsWith('0x')) {
    return { tokenAddress: pool, chain: null };
  }

  return { tokenAddress: prefix, chain: suffix };
}

// Validate that a token address looks like a valid EVM address
function isValidEvmAddress(address) {
  return address.startsWith('0x') && address.length === 42;
}

module.exports = {
  fetchHolders,
  parsePoolField,
  isValidEvmAddress,
  resolveChainId,
  API_BASE,
};
