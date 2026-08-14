const crypto = require('crypto');

// Namespace for deterministic pool UUIDs (RFC 4122 UUIDv5). Must stay identical
// to YIELD_POOL_NAMESPACE in yield-server-v2 (src/common/poolId.ts) so both
// pipelines mint the same id for the same adapter pool key.
const YIELD_POOL_NAMESPACE = 'd2bb36db-2d93-4a4e-8069-60d1bddf6036';

// Used only when a pool key is seen for the first time; existing config rows keep
// their stored uuid. Manual pool renames update config.pool and keep the uuid, so
// a stored id is not guaranteed to equal derivePoolId(current key) - never
// re-derive ids for existing rows.
const derivePoolId = (pool) => {
  const namespaceBytes = Buffer.from(
    YIELD_POOL_NAMESPACE.replace(/-/g, ''),
    'hex'
  );
  const hash = crypto
    .createHash('sha1')
    .update(namespaceBytes)
    .update(String(pool), 'utf8')
    .digest();
  hash[6] = (hash[6] & 0x0f) | 0x50;
  hash[8] = (hash[8] & 0x3f) | 0x80;
  const hex = hash.subarray(0, 16).toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(
    12,
    16
  )}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
};

// self-check on module load: pins the derivation to the RFC 4122 reference
// output (same vector asserted in yield-server-v2 src/common/poolId.test.ts).
// if the implementation or namespace ever drifts, fail before minting any id.
if (derivePoolId('aave-v3-WETH') !== '7e0520c4-e3a0-54c5-b3de-ed95d80b7189') {
  throw new Error('poolId derivation drifted from the shared reference vector');
}

module.exports = { derivePoolId };
