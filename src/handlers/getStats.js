const dbConnection = require('../api/dbConnection.js');
const statsModel = require('../models/stats');
const AppError = require('../utils/appError');

// get expanding standard deviation data
module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const conn = await dbConnection.connect();
  const M = conn.model(statsModel.modelName);

  // return all documents
  const response = await M.find({}, { _id: 0, createdAt: 0, updatedAt: 0 });

  if (!response) {
    return new AppError("Couldn't get stats data", 404);
  }

  return {
    status: 'success',
    data: response,
  };
};
