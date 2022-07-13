const superagent = require('superagent');
const { insertStats } = require('../api/controllers');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  await main();
};

const main = async () => {
  console.log('\n1. pulling latest poolsEnriched data...');
  const urlBase = process.env.APIG_URL;
  let dataEnriched = (await superagent.get(`${urlBase}/poolsEnriched`)).body
    .data;
  // create return field
  const T = 365;
  // transform raw apy to return field (required for geometric mean below)
  dataEnriched = dataEnriched.map((p) => ({
    ...p,
    return: (1 + p.apy / 100) ** (1 / T) - 1,
  }));

  console.log('\n2. pulling latest stats data...');
  const dataStats = (await superagent.get(`${urlBase}/stats`)).body.data;

  const payload = [];
  for (const p of dataEnriched) {
    d = dataStats.find((i) => i.pool === p.pool);

    if (d !== undefined) {
      // calc std using welford's algorithm
      // https://en.wikipedia.org/wiki/Algorithms_for_calculating_variance
      // For a new value newValue, compute the new count, new mean, the new M2.
      // mean accumulates the mean of the entire dataset
      // M2 aggregates the squared distance from the mean
      // count aggregates the number of samples seen so far

      // extract
      count = d.count;
      meanAPY = d.meanAPY;
      mean2APY = d.mean2APY;
      meanDR = d.meanDR;
      mean2DR = d.mean2DR;
      productDR = d.productDR;

      // update using welford algo
      count += 1;
      // a) ML section
      deltaAPY = p.apy - meanAPY;
      meanAPY += deltaAPY / count;
      delta2APY = p.apy - meanAPY;
      mean2APY += deltaAPY * delta2AY;
      // b) scatterchart section
      deltaDR = p.return - meanDR;
      meanDR += deltaDR / count;
      delta2 = p.return - meanDR;
      mean2DR += deltaDR * delta2DR;
      productDR = (1 + p.return) * productDR;
    } else {
      // in case of a new pool -> boostrap db values
      count = 1;
      // a) ML section
      meanAPY = p.apy;
      mean2APY = 0;
      // b) scatterchart section
      meanDR = p.return;
      mean2DR = 0;
      productDR = 1 + p.return;
    }

    payload.push({
      pool: p.pool,
      count,
      meanAPY,
      mean2APY,
      meanDR,
      mean2DR,
      productDR,
    });
  }

  const response = await insertStats(payload);
  console.log(response.body);
};
