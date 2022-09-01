const fs = require('fs');

const ss = require('simple-statistics');

const { confirm } = require('../src/utils/confirm');
const { insertMedian } = require('../src/controllers/medianController');

(async () => {
  await confirm(
    `Confirm with 'yes' if you want to start the ${process.argv[1]
      .split('/')
      .slice(-1)} script: `
  );
  // yield.json is a yield table snapshot of daily values only
  // (the last value per configID (== pool) per day)
  let data = JSON.parse(fs.readFileSync(process.argv[2]));

  const payload = [];
  for (const [i, timestamp] of [
    ...new Set(data.map((el) => el.timestamp)),
  ].entries()) {
    console.log(i, timestamp);

    // filter to day
    let X = data.filter((el) => el.timestamp === timestamp);

    payload.push({
      timestamp: new Date(timestamp),
      medianAPY: ss.median(X.map((p) => p.apy)),
      uniquePools: new Set(X.map((p) => p.pool)).size,
    });
  }

  const response = await insertMedian(payload);
  console.log(response);
  process.exit(0);
})();
