const dbConnection = require('../api/dbConnection.js');
const aggModel = require('../models/agg');
const AppError = require('../utils/appError');
const { storeCompressed } = require('../utils/s3.js');
const {handler: getAggs} = require("./getAggs");

// get standard deviation
module.exports.handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const conn = await dbConnection.connect();
  const M = conn.model(aggModel.modelName);

  const payload = JSON.parse(event.body);

  // updating via bulkwrite with array of updateOne operations
  const bulkOperations = [];
  for (const el of payload) {
    bulkOperations.push({
      updateOne: {
        filter: { pool: el.pool },
        update: {
          $set: {
            count: el.count,
            mean: el.mean,
            mean2: el.mean2,
            returnProduct: el.returnProduct,
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

  const aggsData = await getAggs({}, {})
  const next24h = new Date()
  next24h.setHours(next24.getHours() + 24)
  next24h.setMinutes(0)
  next24h.setSeconds(0)
  next24h.setMilliseconds(0)
  await storeCompressed('defillama-datasets', "yield-api/aggregations", aggsData, next24h)

  return {
    status: 'success',
    response,
  };
};
