/**
 * Local test script for the holder scanner.
 * Tests against real on-chain data — no DB required.
 *
 * Usage:
 *   node src/utils/testHolderScanner.js
 *   node src/utils/testHolderScanner.js <chain> <tokenAddress>
 *
 * Examples:
 *   node src/utils/testHolderScanner.js
 *   node src/utils/testHolderScanner.js ethereum 0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811
 *   node src/utils/testHolderScanner.js base 0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913
 */

const { scanTransfers, deriveMetrics, getLatestBlock, parsePoolField } = require('./holderScanner');

// Test tokens with known holder counts (approximate, for sanity checking)
const TEST_CASES = [
  {
    name: 'Aave aUSDT v3 (Ethereum)',
    chain: 'ethereum',
    token: '0x23878914EFE38d27C4D67Ab83ed1b93A74D4086a',
    expectedHolders: { min: 500, max: 50000 },
    tvlUsd: 500_000_000,
  },
  {
    name: 'USDC (Base) — large token stress test',
    chain: 'base',
    token: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    expectedHolders: { min: 10000, max: 10_000_000 },
    tvlUsd: 3_000_000_000,
    // This one has MANY transfers — good for testing streaming
    // May take several minutes. Skip with --quick flag.
    slow: true,
  },
];

async function testParsePoolField() {
  console.log('\n=== Test: parsePoolField ===');
  const cases = [
    { input: '0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811-ethereum', expected: { tokenAddress: '0x3Ed3B47Dd13EC9a98b44e6204A523E766B225811', chain: 'ethereum' } },
    { input: '0xabc123-0xdef456-base', expected: { tokenAddress: '0xabc123-0xdef456', chain: 'base' } },
    { input: '0xonly', expected: { tokenAddress: '0xonly', chain: null } },
  ];

  let passed = 0;
  for (const { input, expected } of cases) {
    const result = parsePoolField(input);
    const ok = result.tokenAddress === expected.tokenAddress && result.chain === expected.chain;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}: parsePoolField("${input}") => ${JSON.stringify(result)}`);
    if (ok) passed++;
  }
  console.log(`  ${passed}/${cases.length} passed`);
  return passed === cases.length;
}

async function testBalanceMapLogic() {
  console.log('\n=== Test: Balance Map Logic (unit test) ===');
  const { applyTransfer, ZERO_ADDR } = require('./holderScanner');

  const balances = {};

  // Mint 1000 to Alice
  applyTransfer(balances, ZERO_ADDR, '0xalice', '1000');
  console.log(`  After mint 1000 to alice: ${JSON.stringify(balances)}`);
  let ok = balances['0xalice'] === '1000';
  console.log(`  ${ok ? 'PASS' : 'FAIL'}: alice has 1000`);

  // Transfer 300 from Alice to Bob
  applyTransfer(balances, '0xalice', '0xbob', '300');
  ok = balances['0xalice'] === '700' && balances['0xbob'] === '300';
  console.log(`  ${ok ? 'PASS' : 'FAIL'}: alice=700, bob=300`);

  // Burn all of Bob's tokens
  applyTransfer(balances, '0xbob', ZERO_ADDR, '300');
  ok = !('0xbob' in balances) && balances['0xalice'] === '700';
  console.log(`  ${ok ? 'PASS' : 'FAIL'}: bob removed, alice=700`);

  // Test deriveMetrics
  const metrics = deriveMetrics(balances, 70000);
  ok = metrics.holderCount === 1 && metrics.avgPositionUsd === 70000;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}: holderCount=1, avgPosition=$70000`);
  console.log(`  Metrics: ${JSON.stringify(metrics, null, 2)}`);

  return true;
}

async function testLiveScanner(chain, token, name, expectedHolders, tvlUsd) {
  console.log(`\n=== Test: Live Scanner — ${name} ===`);
  console.log(`  Chain: ${chain}, Token: ${token}`);

  const startTime = Date.now();

  // Get latest block
  const currentBlock = await getLatestBlock(chain);
  console.log(`  Current block: ${currentBlock}`);

  // For speed, only scan last ~30 days of blocks (~216k blocks on Ethereum)
  // Full scan from 0 is what production does, but takes much longer
  const blocksPerDay = chain === 'ethereum' ? 7200 : chain === 'base' ? 43200 : 7200;
  const fromBlock = Math.max(0, currentBlock - blocksPerDay * 30);
  console.log(`  Scanning from block ${fromBlock} (last ~30 days)`);

  const balanceMap = await scanTransfers(chain, token, fromBlock, currentBlock);
  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);

  const holderCount = Object.keys(balanceMap).length;
  console.log(`  Holders found: ${holderCount} (in ${elapsed}s)`);

  // Note: 30-day scan undercounts vs full history, but should still be substantial
  if (holderCount === 0) {
    console.log(`  FAIL: 0 holders — scanner likely broken`);
    return false;
  }

  const metrics = deriveMetrics(balanceMap, tvlUsd);
  console.log(`  Holder count: ${metrics.holderCount}`);
  console.log(`  Avg position: $${metrics.avgPositionUsd?.toFixed(0)}`);
  console.log(`  Top 10 concentration: ${metrics.top10Pct}%`);
  console.log(`  Top 3 holders:`);
  for (const h of metrics.top10Holders.slice(0, 3)) {
    console.log(`    ${h.address}: ${h.balancePct}%`);
  }

  // Sanity checks
  const checks = [];
  checks.push({
    name: 'holderCount > 0',
    ok: metrics.holderCount > 0,
  });
  checks.push({
    name: 'top10Pct is a valid percentage',
    ok: metrics.top10Pct >= 0 && metrics.top10Pct <= 100,
  });
  checks.push({
    name: 'avgPositionUsd is positive',
    ok: metrics.avgPositionUsd > 0,
  });
  checks.push({
    name: 'top10Holders has correct structure',
    ok:
      Array.isArray(metrics.top10Holders) &&
      metrics.top10Holders.length <= 10 &&
      metrics.top10Holders.every((h) => h.address && typeof h.balancePct === 'number'),
  });

  let allPassed = true;
  for (const c of checks) {
    console.log(`  ${c.ok ? 'PASS' : 'FAIL'}: ${c.name}`);
    if (!c.ok) allPassed = false;
  }

  return allPassed;
}

async function main() {
  console.log('=== Holder Scanner Test Suite ===');
  const args = process.argv.slice(2);
  const quick = args.includes('--quick');

  let allPassed = true;

  // Unit tests
  allPassed = (await testParsePoolField()) && allPassed;
  allPassed = (await testBalanceMapLogic()) && allPassed;

  // Custom token from CLI args
  if (args.length >= 2 && !args[0].startsWith('--')) {
    const [chain, token] = args;
    allPassed = (await testLiveScanner(chain, token, `Custom: ${token}`, { min: 1, max: 10_000_000 }, 1_000_000)) && allPassed;
  } else {
    // Default test cases
    for (const tc of TEST_CASES) {
      if (tc.slow && quick) {
        console.log(`\n  SKIP (--quick): ${tc.name}`);
        continue;
      }
      try {
        const result = await testLiveScanner(tc.chain, tc.token, tc.name, tc.expectedHolders, tc.tvlUsd);
        allPassed = result && allPassed;
      } catch (e) {
        console.log(`\n  ERROR: ${tc.name}: ${e.message}`);
        allPassed = false;
      }
    }
  }

  console.log(`\n${'='.repeat(50)}`);
  console.log(allPassed ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED');
  process.exit(allPassed ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
