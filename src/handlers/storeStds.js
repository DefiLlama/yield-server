const dbConnection = require('../api/dbConnection.js');
const stdModel = require('../models/std');
const AppError = require('../utils/appError');

// get standard deviation
module.exports.handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const conn = await dbConnection.connect();
  const M = conn.model(stdModel.modelName);

  const payload = JSON.parse(event.body);

  // updating via bulkwrite with array of updateOne operations
  const bulkOperations = [];
  for (const el of payload) {
    bulkOperations.push({
      updateOne: {
        filter: { pool: el.pool },
        update: { $set: { count: el.count, mean: el.mean, mean2: el.mean2 } },
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
