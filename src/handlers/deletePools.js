const dbConnection = require('../api/dbConnection.js');
const poolModel = require('../models/pool');
const AppError = require('../utils/appError');

module.exports.handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const conn = await dbConnection.connect();
  const M = conn.model(poolModel.modelName);

  const timestamp = Number(event.pathParameters.timestamp);
  const lb = new Date(timestamp * 1000);
  const ub = new Date((timestamp + 86400) * 1000);

  // we filter to a project and the current timestamp from midnight up to the next day midnight
  // eg timestamp 1649116800 == 2022-04-05T00:00:00.000Z
  // lb == 2022-04-05T00:00:00.000Z; ub == 2022-04-06T00:00:00.000Z
  // we remove everything >= lb up to < ub
  const filter = {
    project: event.pathParameters.project,
    timestamp: { $gte: lb, $lt: ub },
  };

  const response = await M.deleteMany(filter);

  if (!response) {
    return new AppError("Couldn't delete data", 404);
  }

  return {
    status: 'success',
    response,
  };
};
