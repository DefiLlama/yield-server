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

  // On success: everything from "Test Suites:" onward (includes pool output from
  // afterTests.js). On failure: the jest failure blocks too, capped, so the
  // reason is visible in the comment and not just the counts.
  const summaryIndex = file.indexOf('Test Suites:');
  if (summaryIndex === -1) return;

  const failureIndex = file.indexOf('●');
  const hasFailureDetail =
    failed && failureIndex !== -1 && failureIndex < summaryIndex;

  let output = file.substring(summaryIndex);
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
