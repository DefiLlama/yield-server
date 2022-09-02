const fs = require('fs');

const ss = require('simple-statistics');

const { confirm } = require('../src/utils/confirm');
const { insertStat } = require('../src/controllers/statController');

(async () => {
  await confirm(
    `Confirm with 'yes' if you want to start the ${process.argv[1]
      .split('/')
      .slice(-1)} script: `
  );
  // yield.json is a yield table snapshot of daily values only
  // (the last value per configID (== pool) per day)
  let data = JSON.parse(fs.readFileSync(process.argv[2]));

  // create return field
  const T = 365;
  // transform raw apy to return field (required for geometric mean below)
  data = data.map((p) => ({
    ...p,
    return: (1 + p.apy / 100) ** (1 / T) - 1,
  }));

  const payload = [];
  for (const [i, cID] of [
    ...new Set(data.map((el) => el.configID)),
  ].entries()) {
    console.log(i);

    // filter to config id
    let X = data.filter((el) => el.configID === cID);
    if (X.length === 0) continue;

    const count = X.length;
    const seriesAPY = X.map((p) => p.apy);
    const seriesReturn = X.map((p) => p.return);

    payload.push({
      configID: cID,
      count,
      meanAPY: seriesAPY.reduce((a, b) => a + b, 0) / count,
      mean2APY: count < 2 ? null : ss.variance(seriesAPY) * (count - 1),
      meanDR: seriesReturn.reduce((a, b) => a + b, 0) / count,
      mean2DR: count < 2 ? null : ss.variance(seriesReturn) * (count - 1),
      productDR: seriesReturn.map((a) => 1 + a).reduce((a, b) => a * b),
    });
  }

  const response = await insertStat(payload);
  console.log(response);
  process.exit(0);
})();
