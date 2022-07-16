const superagent = require('superagent');
const { insertStats } = require('../api/controllers');
const { welfordUpdate } = require('../utils/welford');

module.exports.handler = async () => {
  await main();
};

const main = async () => {
  const urlBase = process.env.APIG_URL;
  let dataEnriched = (await superagent.get(`${urlBase}/poolsEnriched`)).body
    .data;
  const T = 365;
  // transform raw apy to return field (required for geometric mean)
  dataEnriched = dataEnriched.map((p) => ({
    ...p,
    return: (1 + p.apy / 100) ** (1 / T) - 1,
  }));

  const dataStats = (await superagent.get(`${urlBase}/stats`)).body.data;
  const payload = welfordUpdate(dataEnriched, dataStats);
  const response = await insertStats(payload);
  console.log(response);
};
