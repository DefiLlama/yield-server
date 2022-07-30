const ss = require('simple-statistics');

const { readFromS3 } = require('../utils/s3');
const medianModel = require('../models/median');
const AppError = require('../utils/appError');
const dbConnection = require('../utils/dbConnection.js');

module.exports.handler = async () => {
  await main();
};

const main = async () => {
  // read from internal s3 bucket which also includes the pools timestamp which we use to exclude
  // any pool which has not been updated on that particular day (eg adapter failed during the whole day, or pool might be stale etc.)
  // [checked, and only affect a small nb of pools (< 3%)]
  // removing these pools gives an unbiased median calculatiion for that particular day, otherwise
  let dataEnriched = await readFromS3(
    process.env.BUCKET_DATA,
    'enriched/dataEnriched.json'
  );
  console.log('prior filter', dataEnriched.length);
  const latestDay = Math.max(
    ...[...new Set(dataEnriched.map((p) => p.timestamp.split('T')[0]))].map(
      (d) => new Date(d)
    )
  );
  dataEnriched = dataEnriched.filter((p) => new Date(p.timestamp) >= latestDay);
  console.log('after filter', dataEnriched.length);

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
