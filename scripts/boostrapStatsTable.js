const fs = require('fs');

const AWS = require('aws-sdk');
const ss = require('simple-statistics');

const storeStats = require('../src/api/storeStats');

// set config (we run this script locally)
const credentials = new AWS.SharedIniFileCredentials({ profile: 'defillama' });
AWS.config.credentials = credentials;

(async () => {
  // pools.json is a full database snapshot of daily values only (the last value per pool per day)
  // containing timestamp, apy, pool fields
  const p = './pools.json';
  let data = JSON.parse(fs.readFileSync(p));
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

    // filter to pool, keep only values greater 0 and below extreme value
    let X = data.filter(
      (el) => el.pool === pool && el.apy > 0 && el.apy <= 1e6
    );
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
      returnProduct: seriesReturn.map((a) => 1 + a).reduce((a, b) => a * b),
    });
  }

  const response = await storeStats(payload);
  console.log(response.body);
})();
