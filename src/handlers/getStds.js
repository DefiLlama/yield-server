const dbConnection = require('../api/dbConnection.js');
const stdModel = require('../models/std');
const AppError = require('../utils/appError');

// get expanding standard deviation data
module.exports.handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const conn = await dbConnection.connect();
  const M = conn.model(stdModel.modelName);

  const response = await M.find({}, { _id: 0, createdAt: 0, updatedAt: 0 });

  if (!response) {
    return new AppError("Couldn't get std data", 404);
  }

  return {
    status: 'success',
    data: response,
  };
};
