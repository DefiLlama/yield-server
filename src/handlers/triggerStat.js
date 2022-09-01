const { welfordUpdate } = require('../utils/welford');
const { buildPoolsEnriched } = require('./getPoolsEnriched');
const { getStat, insertStat } = require('../controllers/statController');

module.exports.handler = async (event, context) => {
  await main();
};

// we trigger this once per day at midnight, reason: the stat table was boostrapped on
// daily values, and the ML relying on those features was trained on daily values too.
// so i want to keep things consistent (even though it shouldnt be a big difference, at least
// for the majority of pools)
const main = async () => {
  const urlBase = process.env.APIG_URL;
  let dataEnriched = await buildPoolsEnriched(undefined);
  const T = 365;
  // transform raw apy to return field (required for geometric mean)
  dataEnriched = dataEnriched.map((p) => ({
    ...p,
    return: (1 + p.apy / 100) ** (1 / T) - 1,
  }));

  const dataStat = await getStat();
  const payload = welfordUpdate(dataEnriched, dataStat);
  const response = await insertStat(payload);
  console.log(response);
};
