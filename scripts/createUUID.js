const fs = require('fs');
const crypto = require('crypto');

const data = JSON.parse(fs.readFileSync('./yield_snapshot_last.json'));
const uniquePools = new Set(data.map((p) => p.pool));
console.log('nb of unique pools: ', uniquePools.size);

const uuidMapping = {};
for (const pool of uniquePools) {
  uuidMapping[pool] = crypto.randomUUID();
}
console.log(
  'nb of unique pools in mapping: ',
  new Set(Object.keys(uuidMapping)).size
);
console.log(
  'nb of unique uuids in mapping: ',
  new Set(Object.values(uuidMapping)).size
);

fs.writeFileSync('./created_uuids.json', JSON.stringify(uuidMapping));
