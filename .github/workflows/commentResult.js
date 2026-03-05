const { readFileSync } = require('fs');
const fetch = require('node-fetch');

async function main() {
  const [, , log, author, repo, pr, adapter] = process.argv;
  const file = readFileSync(log, 'utf-8');

  const token = process.env.COMMENT_TOKEN;
  if (!token) {
    console.error('COMMENT_TOKEN not set, skipping PR comment');
    return;
  }

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
        \n \n ${file.substring(summaryIndex).replaceAll('\n', '\n    ')}`;
  } else return;

  await fetch(
    `https://api.github.com/repos/${author}/${repo}/issues/${pr}/comments`,
    {
      body: JSON.stringify({ body }),
      method: 'POST',
      headers: {
        Authorization: `token ${token}`,
        Accept: 'application/vnd.github.v3+json',
      },
    }
  );
}
main();
