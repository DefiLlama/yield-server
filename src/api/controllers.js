const dbConnection = require('./dbConnection.js');
const poolModel = require('../models/pool');
const statsModel = require('../models/stats');
const AppError = require('../utils/appError');

const insertPools = async (payload) => {
  const conn = await dbConnection.connect();
  const M = conn.model(poolModel.modelName);

  const response = await M.insertMany(payload);

  if (!response) {
    return new AppError("Couldn't insert data", 404);
  }

  return {
    status: 'success',
    response: `Inserted ${payload.length} samples`,
  };
};

const insertStats = async (payload) => {
  const conn = await dbConnection.connect();
  const M = conn.model(statsModel.modelName);

  const bulkOperations = [];
  for (const el of payload) {
    bulkOperations.push({
      updateOne: {
        filter: { pool: el.pool },
        update: {
          $set: {
            count: el.count,
            meanAPY: el.meanAPY,
            mean2APY: el.mean2APY,
            meanDR: el.meanDR,
            mean2DR: el.meanDR,
            meanProductDR: el.meanProductDR,
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

  return {
    status: 'success',
    response,
  };
};

const deletePools = async (timestamp, project) => {
  const conn = await dbConnection.connect();
  const M = conn.model(poolModel.modelName);

  const lb = new Date(timestamp * 1000);
  const ub = new Date((timestamp + 86400) * 1000);

  // we filter to a project and the current timestamp from midnight up to the next day midnight
  // eg timestamp 1649116800 == 2022-04-05T00:00:00.000Z
  // lb == 2022-04-05T00:00:00.000Z; ub == 2022-04-06T00:00:00.000Z
  // we remove everything >= lb up to < ub
  const filter = {
    project,
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

module.exports = {
  insertPools,
  insertStats,
  deletePools,
};
