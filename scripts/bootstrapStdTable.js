const fs = require('fs');

const ss = require('simple-statistics');
const superagent = require('superagent');
const AWS = require('aws-sdk');
const credentials = new AWS.SharedIniFileCredentials({ profile: 'defillama' });
AWS.config.credentials = credentials;

// script for boostrapping std and quantile tables (running locally)
// when calculating the expanding stds, i want to include all data
// i've collected so far, hence why i need this step to create the fields
// required by welford's algorithm
const main = async () => {
  const dataStd = [];
  // path to latest db snapshot (full history!)
  const p = './pools.json';
  const data = JSON.parse(fs.readFileSync(p));

  for (const [i, pool] of [...new Set(data.map((el) => el.pool))].entries()) {
    console.log(i);

    // filter to pool and add day and time fields
    let X = data
      .filter((el) => el.pool === pool)
      .map((el) => ({
        ...el,
        day: el.timestamp['$date'].split('T')[0],
        time: Number(el.timestamp['$date'].split('T')[1].slice(0, 2)),
      }));

    // find latest data point per day
    const latestDaily = [];
    for (const d of [...new Set(X.map((el) => el.day))]) {
      let x = X.filter((el) => el.day === d);
      const maxTime = Math.max.apply(
        Math,
        x.map((t) => t.time)
      );
      // append to array
      latestDaily.push(x.find((el) => el.time === maxTime));
    }

    // i remove extreme values (eg there is 'bifi-maxi-56' with apy values of >1e100...)
    X = latestDaily
      .map((el) => el.apy)
      .filter((el) => el !== null && el >= 0 && el <= 1e6);

    const count = X.length;
    if (count === 0) {
      continue;
    }
    const mean = X.reduce((a, b) => a + b, 0) / count;
    const mean2 = count < 2 ? null : ss.variance(X) * (count - 1);

    dataStd.push({
      pool,
      count,
      mean,
      mean2,
    });
  }

  // save to tables
  const ssm = new AWS.SSM({ region: 'eu-central-1' });
  const options = {
    Name: '/llama-apy/serverless/sls-authenticate/bearertoken',
    WithDecryption: true,
  };
  const token = await ssm.getParameter(options).promise();

  const urlBase = 'https://1rwmj4tky9.execute-api.eu-central-1.amazonaws.com';
  const responseStd = await superagent
    .post(`${urlBase}/stds`)
    .send(dataStd)
    .set({ Authorization: `Bearer ${token.Parameter.Value}` });
  console.log(responseStd.body);
};

(async () => {
  await main();
})();
