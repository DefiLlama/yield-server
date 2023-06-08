const fs = require('fs');

const ss = require('simple-statistics');

const { confirm } = require('./confirm');
const { insertStat } = require('../src/queries/stat');

(async () => {
  await confirm(
    `Confirm with 'yes' if you want to start the ${process.argv[1]
      .split('/')
      .slice(-1)} script: `
  );
  // load yield table snapshot of daily values only
  let data = JSON.parse(fs.readFileSync('./yield_snapshot_daily.json'));

  // load the uuids
  const uuids = JSON.parse(fs.readFileSync('./created_uuids.json'));

  // create return field
  const T = 365;
  // transform raw apy to return field (required for geometric mean below)
  data = data.map((p) => ({
    pool: p.pool,
    apy: p.apy,
    return: (1 + p.apy / 100) ** (1 / T) - 1,
  }));

  const payload = [];
  for (const [i, pool] of [...new Set(data.map((p) => p.pool))].entries()) {
    console.log(i);

    // filter to config id
    let X = data.filter((p) => p.pool === pool);
    if (X.length === 0) continue;

    const count = X.length;
    const seriesAPY = X.map((p) => p.apy);
    const seriesReturn = X.map((p) => p.return);

    payload.push({
      configID: uuids[pool],
      count,
      meanAPY: seriesAPY.reduce((a, b) => a + b, 0) / count,
      mean2APY: count < 2 ? 0 : ss.variance(seriesAPY) * (count - 1),
      meanDR: seriesReturn.reduce((a, b) => a + b, 0) / count,
      mean2DR: count < 2 ? 0 : ss.variance(seriesReturn) * (count - 1),
      productDR: seriesReturn.map((a) => 1 + a).reduce((a, b) => a * b),
    });
  }
  const response = await insertStat(payload);
  console.log(response);
  process.exit(0);
})();
