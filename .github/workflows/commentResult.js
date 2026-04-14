const { readFileSync, writeFileSync, mkdirSync, existsSync } = require('fs');
const path = require('path');

function rawValue(val) {
  if (val == null) return '';
  if (Array.isArray(val)) return val.join(', ');
  return String(val);
}

function buildPoolTable(pools) {
  if (!pools.length) return '';

  // Collect all unique keys across all pools, preserving insertion order
  const allKeys = [];
  const seen = new Set();
  for (const pool of pools) {
    for (const key of Object.keys(pool)) {
      if (!seen.has(key)) {
        seen.add(key);
        allKeys.push(key);
      }
    }
  }

  const header = '| # | ' + allKeys.join(' | ') + ' |';
  const sep = '|---:| ' + allKeys.map(() => '---').join(' | ') + ' |';
  const rows = pools.map((p, i) => {
    const cells = allKeys.map((k) => rawValue(p[k]));
    return `| ${i} | ${cells.join(' | ')} |`;
  });

  return [header, sep, ...rows].join('\n');
}

function main() {
  const [, , log, outDir, adapter] = process.argv;
  const file = readFileSync(log, 'utf-8');

  const passed = /PASS\s+.*test\.js/.test(file);
  const failed = /FAIL\s+.*test\.js/.test(file);

  // Read pool data from JSON output (written by beforeTests.js)
  let pools = [];
  const jsonPath = path.resolve(
    __dirname,
    '../../.test-adapter-output',
    `${adapter}.json`
  );
  if (existsSync(jsonPath)) {
    try {
      pools = JSON.parse(readFileSync(jsonPath, 'utf-8'));
    } catch (e) {}
  }

  // Extract test summary
  const summaryMatch = file.match(/Test Suites:[\s\S]*?Ran all test suites\./);
  const summary = summaryMatch ? summaryMatch[0].trim() : '';

  let body;
  if (passed && !failed) {
    const poolCount =
      pools.length || (file.match(/Nb of pools: (\d+)/)?.[1] ?? '?');
    body = `### :white_check_mark: \`${adapter}\` — ${poolCount} pool${poolCount != 1 ? 's' : ''}, all tests passed\n\n`;
    if (pools.length) {
      body += buildPoolTable(pools) + '\n\n';
    }
    if (summary) {
      body += `<details>\n<summary>Test details</summary>\n\n\`\`\`\n${summary}\n\`\`\`\n</details>`;
    }
  } else if (failed) {
    const failStart = file.search(/FAIL\s/);
    const failSection = failStart !== -1 ? file.substring(failStart) : file;
    body = `### :x: \`${adapter}\` — tests failed\n\n`;
    body += `\`\`\`\n${failSection.trim()}\n\`\`\``;
  } else {
    return;
  }

  mkdirSync(outDir, { recursive: true });
  const safeName = (adapter || 'general').replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${Date.now()}-${process.pid}-${safeName}.md`;
  writeFileSync(path.join(outDir, fileName), body);
}

main();
