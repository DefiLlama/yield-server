const ss = require('simple-statistics');

const medianModel = require('../models/median');
const AppError = require('../utils/appError');
const dbConnection = require('../utils/dbConnection.js');
const { buildPoolsEnriched } = require('../handlers/getPoolsEnriched');

module.exports.handler = async () => {
  await main();
};

const main = async () => {
  const dataEnriched = await buildPoolsEnriched(undefined);

  const payload = [
    {
      timestamp: new Date(
        Math.floor(Date.now() / 1000 / 60 / 60) * 60 * 60 * 1000
      ),
      medianAPY: ss.median(dataEnriched.map((p) => p.apy)),
      uniquePools: new Set(dataEnriched.map((p) => p.pool)).size,
    },
  ];
  const response = await insertMedian(payload);
  console.log(response);
};

const insertMedian = async (payload) => {
  const conn = await dbConnection.connect();
  const M = conn.model(medianModel.modelName);

  const bulkOperations = [];
  for (const el of payload) {
    bulkOperations.push({
      updateOne: {
        // need to provide a filter value, otherwise this won't work
        filter: { timestamp: 0 },
        update: {
          $set: el,
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

module.exports.insertMedian = insertMedian;
