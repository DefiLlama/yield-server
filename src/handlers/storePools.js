const dbConnection = require('../api/dbConnection.js');
const poolModel = require('../models/pool');
const AppError = require('../utils/appError');

// insert pools
module.exports.handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const conn = await dbConnection.connect();
  const M = conn.model(poolModel.modelName);

  const payload = JSON.parse(event.body);

  const response = await M.insertMany(payload);

  if (!response) {
    return new AppError("Couldn't update data", 404);
  }

  return {
    status: 'success',
    response: `Inserted ${payload.length} samples`,
  };
};
