const fetch = require('node-fetch');

const MARGINFI_URL = 'https://app.marginfi.com';
const SNAPSHOT_URL =
  'https://marignfi-pools-snapshot.s3.amazonaws.com/snapshot.json';

async function main() {
  const snapshotResponse = await fetch(SNAPSHOT_URL);
  const snapshot = await snapshotResponse.json();
  return snapshot.map((p) => ({ ...p, project: 'marginfi-lending' }));
}

module.exports = {
  timetravel: false,
  apy: main,
  url: MARGINFI_URL,
};
