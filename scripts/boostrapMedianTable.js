const fs = require('fs');

const AWS = require('aws-sdk');
const ss = require('simple-statistics');

const { confirm } = require('../src/utils/confirm');
const { boundaries } = require('../src/utils/exclude');
const { insertMedian } = require('../src/handlers/triggerMedian');

// set config (we run this script locally)
const credentials = new AWS.SharedIniFileCredentials({ profile: 'defillama' });
AWS.config.credentials = credentials;
AWS.config.update({ region: 'eu-central-1' });
process.env['SSM_PATH'] = '/llama-apy/serverless/sls-authenticate';

(async () => {
  await confirm(
    `Confirm with 'yes' if you want to start the ${process.argv[1]
      .split('/')
      .slice(-1)} script: `
  );
  // pools.json is a full database snapshot of daily values only (the last value per pool per day)
  // containing pool and the total apy fields
  let data = JSON.parse(fs.readFileSync(process.argv[2]));
  // keeping positive values only
  data = data.filter(
    (p) =>
      p.apy !== null && p.apy >= boundaries.apy.lb && p.apy <= boundaries.apy.ub
  );
  const payload = [];
  for (const [i, timestamp] of [
    ...new Set(data.map((el) => el.timestamp)),
  ].entries()) {
    console.log(i, timestamp);

    // filter to day
    let X = data.filter((el) => el.timestamp === timestamp);

    payload.push({
      timestamp,
      medianAPY: ss.median(X.map((p) => p.apy)),
      uniquePools: new Set(X.map((p) => p.pool)).size,
    });
  }

  const response = await insertMedian(payload);
  console.log(response);
  process.exit(0);
})();
