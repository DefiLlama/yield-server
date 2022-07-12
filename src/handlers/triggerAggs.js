const superagent = require('superagent');
const { insertAggs } = require('../api/controllers');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await main();
};

const main = async () => {
  console.log(`UPDATE AGGREGATION DATA ${new Date()}`);

  ////// 1) load latest data
  const urlBase = process.env.APIG_URL;
  console.log('\n1. pulling latest poolsEnriched data...');
  const dataEnriched = (await superagent.get(`${urlBase}/poolsEnriched`)).body;

  // prepare apy value
  const T = 365;
  // transform raw apy to return value (required for geometric mean below)
  dataEnriched = dataEnriched.map((p) => ({
    ...p,
    return: (1 + p.apy / 100) ** (1 / T) - 1,
  }));

  ////// 2) load aggregation data
  console.log('\n2. pulling latest aggregation data...');
  let dataAgg = await superagent.get(`${urlBase}/aggregations`);

  const dataUpdated = [];
  for (const el of dataEnriched) {
    d = dataAgg.body.data.find((i) => i.pool === el.pool);

    if (d !== undefined) {
      // calc std using welford's algorithm
      // https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance
      // For a new value newValue, compute the new count, new mean, the new M2.
      // mean accumulates the mean of the entire dataset
      // M2 aggregates the squared distance from the mean
      // count aggregates the number of samples seen so far

      // sigma part
      count = d.count;
      mean = d.mean;
      mean2 = d.mean2;
      // update
      count += 1;
      delta = el.return - mean;
      mean += delta / count;
      delta2 = el.return - mean;
      mean2 += delta * delta2;

      // mu part
      returnProduct = d.returnProduct;
      // update
      returnProduct = (1 + el.return) * returnProduct;
    } else {
      // in case of a new pool, we won't have an entry yet in db and d will be undefined
      // need to store count, mean and mean2 into table
      count = 1;
      mean = el.return;
      mean2 = 0;
      returnProduct = 1 + el.return;
    }

    dataUpdated.push({
      pool: el.pool,
      count,
      mean,
      mean2,
      returnProduct,
    });
  }

  const response = await insertAggs(dataUpdated);
  console.log(response.body);
};
