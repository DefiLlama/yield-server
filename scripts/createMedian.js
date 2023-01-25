const fs = require('fs');

const ss = require('simple-statistics');

const { confirm } = require('./confirm');
const exclude = require('../src/utils/exclude');
const { insertMedian } = require('../src/controllers/medianController');

(async () => {
  await confirm(
    `Confirm with 'yes' if you want to start the ${process.argv[1]
      .split('/')
      .slice(-1)} script: `
  );
  // load yield table snapshot of daily values only
  let data = JSON.parse(fs.readFileSync('./yield_snapshot_daily.json'));
  // we filter further on tvl (10k) cause this is what we do on retrieval from db for frontend
  data = data.filter(
    (p) =>
      p.tvlUsd >= 1e4 &&
      !exclude.excludePools.includes(p.pool) &&
      !exclude.excludeAdaptors.includes(p.project)
  );

  let payload = [];
  for (const [i, timestamp] of [
    ...new Set(data.map((el) => el.timestamp)),
  ].entries()) {
    console.log(i, timestamp);

    // filter to day
    let X = data.filter((el) => el.timestamp === timestamp);

    payload.push({
      timestamp: new Date(timestamp),
      medianAPY: parseFloat(ss.median(X.map((p) => p.apy)).toFixed(5)),
      uniquePools: new Set(X.map((p) => p.pool)).size,
    });
  }
  payload = payload.sort((a, b) => b.timestamp - a.timestamp);

  const response = await insertMedian(payload);
  console.log(response);
  process.exit(0);
})();
