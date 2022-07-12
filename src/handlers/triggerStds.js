const superagent = require('superagent');
const storeStds = require('../api/storeStds');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await main();
};

const main = async () => {
  console.log(`UPDATE STDS DATA ${new Date()}`);

  ////// 1) load latest data
  const urlBase = process.env.APIG_URL;
  console.log('\n1. pulling latest poolsEnriched data...');
  const dataEnriched = (await superagent.get(`${urlBase}/poolsEnriched`)).body
    .data;

  ////// 2) load stds data
  console.log('\n2. pulling latest stds data...');
  let dataStds = await superagent.get(`${urlBase}/stds`);

  const dataUpdated = [];
  for (const el of dataEnriched) {
    d = dataStds.body.data.find((i) => i.pool === el.pool);

    if (d !== undefined) {
      // calc std using welford's algorithm
      // https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance
      // For a new value newValue, compute the new count, new mean, the new M2.
      // mean accumulates the mean of the entire dataset
      // M2 aggregates the squared distance from the mean
      // count aggregates the number of samples seen so far
      count = d.count;
      mean = d.mean;
      mean2 = d.mean2;

      count += 1;
      delta = el.apy - mean;
      mean += delta / count;
      delta2 = el.apy - mean;
      mean2 += delta * delta2;
    } else {
      // in case of a new pool, we won't have an entry yet in db and d will be undefined
      // need to store count, mean and mean2 into table
      count = 1;
      mean = el.apy;
      mean2 = 0;
    }

    dataUpdated.push({
      pool: el.pool,
      count,
      mean,
      mean2,
    });
  }

  const response = await storeStds(dataUpdated);
  console.log(response.body);
};
