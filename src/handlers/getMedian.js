const dbConnection = require('../utils/dbConnection.js');
const medianModel = require('../models/median');
const AppError = require('../utils/appError');

// get expanding standard deviation data
module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const conn = await dbConnection.connect();
  const M = conn.model(medianModel.modelName);

  // return all documents
  const response = await M.find({}, { _id: 0 });

  if (!response) {
    return new AppError("Couldn't get median data", 404);
  }

  return {
    status: 'success',
    data: response,
  };
};
