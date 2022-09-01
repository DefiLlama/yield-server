const statModel = require('../models/stat');
const AppError = require('../utils/appError');
const { welfordUpdate } = require('../utils/welford');
const dbConnection = require('../utils/dbConnectionPostgres.js');
const { buildPoolsEnriched } = require('./getPoolsEnriched');

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

  const dataStats = await getStats();
  const payload = welfordUpdate(dataEnriched, dataStats);
  const response = await insertStats(payload);
  console.log(response);
};

const insertStats = async (payload) => {
  const conn = await dbConnection.connect();
  const M = conn.model(statModel.modelName);

  const bulkOperations = [];
  for (const el of payload) {
    bulkOperations.push({
      updateOne: {
        filter: { pool: el.pool },
        update: {
          $set: {
            count: el.count,
            meanAPY: el.meanAPY,
            mean2APY: el.mean2APY,
            meanDR: el.meanDR,
            mean2DR: el.mean2DR,
            productDR: el.productDR,
          },
        },
        upsert: true,
      },
    });
  }
  const response = await M.bulkWrite(bulkOperations);

  if (!response) {
    return new AppError("Couldn't update data", 404);
  }

  return {
    status: 'success',
    response,
  };
};

// get expanding standard deviation data
const getStats = async () => {
  const conn = await dbConnection.connect();
  const M = conn.model(statModel.modelName);

  // return all documents
  const x = await M.find({}, { _id: 0, createdAt: 0, updatedAt: 0 });
  const response = {};
  for (let d of x) {
    response[d.pool] = d;
  }

  return response;
};

// for boostrapStatsTable.js
module.exports.insertStats = insertStats;
module.exports.getStats = getStats;
