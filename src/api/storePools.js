const dbConnection = require('../api/dbConnection.js');
const poolModel = require('../models/pool');
const AppError = require('../utils/appError');

// insert pools
module.exports.storePools = async (payload) => {
  const conn = await dbConnection.connect();
  const M = conn.model(poolModel.modelName);

  const response = await M.insertMany(payload);

  if (!response) {
    return new AppError("Couldn't update data", 404);
  }

  return {
    status: 'success',
    response: `Inserted ${payload.length} samples`,
  };
};
