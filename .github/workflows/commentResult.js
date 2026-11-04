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
  let file = stripAnsi(readFileSync(log, 'utf-8'));

  const passed = /PASS\s+.*test\.js/.test(file);
  const failed = /FAIL\s+.*test\.js/.test(file);

  const MAX_FAILURE_DETAIL_CHARS = 20000;
  const MAX_POOL_DETAIL_CHARS = 20000;

  // On success: everything from "Test Suites:" onward. On failure: the jest
  // failure blocks too, capped, so the reason is visible in the comment and
  // not just the counts.
  let summaryIndex = file.indexOf('Test Suites:');
  if (summaryIndex === -1) return;

  // afterTests.js (a jest globalTeardown) writes the pool summary to stdout
  // while jest writes its reporter output to stderr. Once that output fills
  // the pipe (large adapters, e.g. morpho-blue), the rest is queued and the
  // pool block can land BEFORE the jest summary, even inside the failure
  // blocks, so slicing from "Test Suites:" drops it. Take the block explicitly
  // and put it back after the summary, where it lands for regular adapters,
  // skipping the per-test lines in between: including them
  // pushed the comment past GitHub's 65536-character limit, so it failed to
  // post at all.
  const poolIndex = file.indexOf('Nb of pools:');
  let poolDetail = '';
  if (poolIndex !== -1 && poolIndex < summaryIndex) {
    const rest = file.slice(poolIndex, summaryIndex);
    const reporterStart = rest.match(/\n\s*(?:✓|✗|✕|●|PASS|FAIL)/);
    const block = reporterStart ? rest.slice(0, reporterStart.index) : rest;
    // cut it out of the log so the failure detail below cannot repeat it
    file = file.slice(0, poolIndex) + file.slice(poolIndex + block.length);
    summaryIndex -= block.length;
    poolDetail = block.trimEnd();
    if (poolDetail.length > MAX_POOL_DETAIL_CHARS) {
      poolDetail =
        poolDetail.substring(0, MAX_POOL_DETAIL_CHARS) +
        '\n\n... pool output truncated ...';
    }
    poolDetail = `\n${poolDetail}\n`;
  }

  const failureIndex = file.indexOf('●');
  const hasFailureDetail =
    failed && failureIndex !== -1 && failureIndex < summaryIndex;

  let output = file.substring(summaryIndex) + poolDetail;
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
