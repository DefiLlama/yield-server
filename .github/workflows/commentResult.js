const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const path = require('path');

const stripAnsi = (text) => text.replace(/\[[0-9;]*m/g, '');

// jest prints a source excerpt and stack trace under each failure; the message
// itself is the only part worth putting in a PR comment
const isNoiseLine = (line) =>
  /^\s*>?\s*\d+\s*\|/.test(line) ||
  /^\s*\|\s*\^+\s*$/.test(line) ||
  /^\s+at\s/.test(line);

const trimFailureDetail = (detail) =>
  detail
    .split('\n')
    .filter((line) => !isNoiseLine(line))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n');

function main() {
  const [, , log, outDir, adapter] = process.argv;
  const file = stripAnsi(readFileSync(log, 'utf-8'));

  const passed = /PASS\s+.*test\.js/.test(file);
  const failed = /FAIL\s+.*test\.js/.test(file);

  const MAX_FAILURE_DETAIL_CHARS = 20000;
  const MAX_POOL_DETAIL_CHARS = 20000;

  // On success: everything from "Test Suites:" onward. On failure: the jest
  // failure blocks too, capped, so the reason is visible in the comment and
  // not just the counts.
  const summaryIndex = file.indexOf('Test Suites:');
  if (summaryIndex === -1) return;

  // afterTests.js (a jest globalTeardown) writes the pool summary to stdout
  // while jest buffers its reporter output and writes it to stderr, so on
  // Node 24 the pool block lands BEFORE the jest summary and slicing from
  // "Test Suites:" drops it. Take the block explicitly and stitch it on,
  // skipping the per-test lines in between: including them pushed the comment
  // past GitHub's 65536-character limit, so it failed to post at all.
  const poolIndex = file.indexOf('Nb of pools:');
  let poolDetail = '';
  if (poolIndex !== -1 && poolIndex < summaryIndex) {
    const rest = file.slice(poolIndex);
    const reporterStart = rest.match(/\n\s*(?:✓|✗|✕|PASS|FAIL|Test Suites:)/);
    poolDetail = (reporterStart ? rest.slice(0, reporterStart.index) : rest).trimEnd();
    if (poolDetail.length > MAX_POOL_DETAIL_CHARS) {
      poolDetail =
        poolDetail.substring(0, MAX_POOL_DETAIL_CHARS) +
        '\n\n... pool output truncated ...';
    }
    poolDetail += '\n\n';
  }

  const failureIndex = file.indexOf('●');
  const hasFailureDetail =
    failed && failureIndex !== -1 && failureIndex < summaryIndex;

  let output = poolDetail + file.substring(summaryIndex);
  if (hasFailureDetail) {
    let detail = trimFailureDetail(file.substring(failureIndex, summaryIndex));
    if (detail.length > MAX_FAILURE_DETAIL_CHARS) {
      detail =
        detail.substring(0, MAX_FAILURE_DETAIL_CHARS) +
        '\n\n... failure output truncated ...\n\n';
    }
    output = detail + output;
  }

  let body;
  if (passed && !failed) {
    body = `The ${adapter} adapter exports pools:
        \n \n ${output.replaceAll('\n', '\n    ')}`;
  } else if (failed) {
    body = `Error while running ${adapter} adapter:
        \n \n ${output.replaceAll('\n', '\n    ')}`;
  } else {
    return;
  }

  mkdirSync(outDir, { recursive: true });
  const safeName = (adapter || 'general').replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${Date.now()}-${process.pid}-${safeName}.md`;
  writeFileSync(path.join(outDir, fileName), body);
}

main();
