const { readFileSync, writeFileSync, mkdirSync } = require('fs');
const path = require('path');

function main() {
  const [, , log, outDir, adapter] = process.argv;
  const file = readFileSync(log, 'utf-8');

  const passed = /PASS\s+.*test\.js/.test(file);
  const failed = /FAIL\s+.*test\.js/.test(file);

  // Everything from "Test Suites:" onward (includes pool output from afterTests.js)
  const summaryIndex = file.indexOf('Test Suites:');
  if (summaryIndex === -1) return;
  const output = file.substring(summaryIndex);

  let body;
  if (passed && !failed) {
    body = `The \`${adapter}\` adapter exports pools:\n\n\`\`\`\n${output.trim()}\n\`\`\``;
  } else if (failed) {
    body = `Error while running \`${adapter}\` adapter:\n\n\`\`\`\n${output.trim()}\n\`\`\``;
  } else {
    return;
  }

  mkdirSync(outDir, { recursive: true });
  const safeName = (adapter || 'general').replace(/[^a-zA-Z0-9._-]/g, '_');
  const fileName = `${Date.now()}-${process.pid}-${safeName}.md`;
  writeFileSync(path.join(outDir, fileName), body);
}

main();
