const fs = require('fs');

const AWS = require('aws-sdk');
const ss = require('simple-statistics');

const { confirm } = require('../src/utils/confirm');
const { boundaries } = require('../src/utils/exclude');
const { insertStats } = require('../src/handlers/triggerStats');

// set config (we run this script locally)
const credentials = new AWS.SharedIniFileCredentials({ profile: 'defillama' });
AWS.config.credentials = credentials;
AWS.config.update({ region: 'eu-central-1' });
process.env['SSM_PATH'] = '/llama-apy/serverless/sls-authenticate';

(async () => {
  await confirm(
    'Confirm with `yes` if you want to start the bootstrapStatsTable script: '
  );
  // pools.json is a full database snapshot of daily values only (the last value per pool per day)
  // containing pool and the total apy fields
  let data = JSON.parse(fs.readFileSync(process.argv[2]));
  // keeping positive values only
  data = data.filter(
    (p) =>
      p.apy !== null && p.apy >= boundaries.apy.lb && p.apy <= boundaries.apy.ub
  );

  // create return field
  const T = 365;
  // transform raw apy to return field (required for geometric mean below)
  data = data.map((p) => ({
    ...p,
    return: (1 + p.apy / 100) ** (1 / T) - 1,
  }));

  const payload = [];
  for (const [i, pool] of [...new Set(data.map((el) => el.pool))].entries()) {
    console.log(i);

    // filter to pool
    let X = data.filter((el) => el.pool === pool);
    if (X.length === 0) continue;

    const count = X.length;
    const seriesAPY = X.map((p) => p.apy);
    const seriesReturn = X.map((p) => p.return);

    payload.push({
      pool,
      count,
      meanAPY: seriesAPY.reduce((a, b) => a + b, 0) / count,
      mean2APY: count < 2 ? null : ss.variance(seriesAPY) * (count - 1),
      meanDR: seriesReturn.reduce((a, b) => a + b, 0) / count,
      mean2DR: count < 2 ? null : ss.variance(seriesReturn) * (count - 1),
      productDR: seriesReturn.map((a) => 1 + a).reduce((a, b) => a * b),
    });
  }

  const response = await insertStats(payload);
  console.log(response);
  process.exit(0);
})();
