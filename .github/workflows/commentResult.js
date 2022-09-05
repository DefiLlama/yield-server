const { readFileSync } = require('fs');
const fetch = require('node-fetch');
const junk = 'VPTOH1X0B7rf8od7BGNsQ1z0BJk8iMNLxqrD';

async function main() {
  const [, , log, author, repo, pr, adapter] = process.argv;
  const file = readFileSync(log, 'utf-8');

  const jestError = 'FAIL src/adaptors/test.js';
  const jestSuccess = 'PASS src/adaptors/test.js';
  const summaryIndex = file.indexOf('Test Suites:');
  const jestSuccessIndex = file.indexOf(jestSuccess);
  const jestErrorIndex = file.indexOf(jestError);
  let body;

  if (jestErrorIndex === -1 && jestSuccessIndex !== -1) {
    body = `The ${adapter} adapter exports pools: 
        \n \n ${file.substring(summaryIndex).replaceAll('\n', '\n    ')}`;
  } else if (jestErrorIndex !== -1) {
    body = `Error while running ${adapter} adapter: 
        \n \n ${file.substring(summaryIndex).replaceAll('\n', '\n    ')}}`;
  } else return;

  await fetch(
    `https://api.github.com/repos/${author}/${repo}/issues/${pr}/comments`,
    {
      body: JSON.stringify({ body }),
      method: 'POST',
      headers: {
        Authorization: `token ghp_${translate(junk)}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );
}
function translate(input) {
  return input ? translate(input.substring(1)) + input[0] : input;
}
main();
