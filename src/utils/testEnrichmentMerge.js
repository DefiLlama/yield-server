/**
 * Test for the holder data merge logic used by the GET /holders endpoint.
 * No DB, no S3, no network — pure logic test with mock data.
 *
 * Usage:
 *   node src/utils/testEnrichmentMerge.js
 */

const poolsResponseColumns = require('./enrichedColumns');

// --- Mock data ---
const mockHolderData = {
  'pool-1': {
    configID: 'pool-1',
    holderCount: 150,
    avgPositionUsd: 6666.666,
    top10Pct: 45.1234,
  },
  'pool-2': {
    configID: 'pool-2',
    holderCount: 50,
    avgPositionUsd: 20000.0,
    top10Pct: 80.999,
  },
};

const mockHolderOffset7d = {
  'pool-1': 140,
  'pool-2': 45,
};

const mockHolderOffset30d = {
  'pool-1': 100,
  // pool-2 intentionally missing (new pool, no 30d history)
};

// --- Holder merge logic (mirrors controllers/yield.js getHolders) ---
function buildHolderResponse(holderData, holderOffset7d, holderOffset30d) {
  const data = {};
  for (const [configID, h] of Object.entries(holderData)) {
    const prev7d = holderOffset7d[configID];
    const prev30d = holderOffset30d[configID];
    data[configID] = {
      holderCount: h.holderCount,
      avgPositionUsd:
        h.avgPositionUsd != null ? +h.avgPositionUsd.toFixed(0) : null,
      top10Pct: h.top10Pct != null ? +h.top10Pct.toFixed(2) : null,
      holderChange7d:
        h.holderCount != null && prev7d != null
          ? h.holderCount - prev7d
          : null,
      holderChange30d:
        h.holderCount != null && prev30d != null
          ? h.holderCount - prev30d
          : null,
    };
  }
  return data;
}

// --- Tests ---
let passed = 0;
let total = 0;

function assert(condition, name) {
  total++;
  if (condition) {
    console.log(`  PASS: ${name}`);
    passed++;
  } else {
    console.log(`  FAIL: ${name}`);
  }
}

console.log('=== Test: Holder Endpoint Merge Logic ===\n');

const result = buildHolderResponse(mockHolderData, mockHolderOffset7d, mockHolderOffset30d);

// Test 1: Full merge with holder data + offsets
console.log('--- Test 1: Full merge (pool-1 with all offsets) ---');
const p1 = result['pool-1'];
assert(p1.holderCount === 150, 'pool-1 holderCount = 150');
assert(p1.avgPositionUsd === 6667, `pool-1 avgPositionUsd rounded to 6667, got ${p1.avgPositionUsd}`);
assert(p1.top10Pct === 45.12, `pool-1 top10Pct rounded to 45.12, got ${p1.top10Pct}`);
assert(p1.holderChange7d === 10, `pool-1 holderChange7d = 150-140 = 10, got ${p1.holderChange7d}`);
assert(p1.holderChange30d === 50, `pool-1 holderChange30d = 150-100 = 50, got ${p1.holderChange30d}`);

// Test 2: Missing 30d offset → holderChange30d = null
console.log('\n--- Test 2: Missing 30d offset (pool-2) ---');
const p2 = result['pool-2'];
assert(p2.holderCount === 50, 'pool-2 holderCount = 50');
assert(p2.holderChange7d === 5, `pool-2 holderChange7d = 50-45 = 5, got ${p2.holderChange7d}`);
assert(p2.holderChange30d === null, `pool-2 holderChange30d = null (no 30d offset), got ${p2.holderChange30d}`);

// Test 3: Only pools with holder data appear in result (no pool-3)
console.log('\n--- Test 3: Only pools with holder data appear ---');
assert(result['pool-3'] === undefined, 'pool-3 not in result (no holder data)');

// Test 4: enrichedColumns does NOT include holder fields (decoupled)
console.log('\n--- Test 4: enrichedColumns excludes holder fields ---');
const holderFields = ['holderCount', 'avgPositionUsd', 'top10Pct', 'holderChange7d', 'holderChange30d'];
for (const field of holderFields) {
  assert(!poolsResponseColumns.includes(field), `enrichedColumns does NOT include '${field}'`);
}

// Summary
console.log(`\n${'='.repeat(50)}`);
console.log(`${passed}/${total} tests passed`);
if (passed === total) {
  console.log('ALL TESTS PASSED');
} else {
  console.log('SOME TESTS FAILED');
  process.exit(1);
}
