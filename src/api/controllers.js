const dbConnection = require('./dbConnection.js');
const poolModel = require('../models/pool');
const stdModel = require('../models/std');
const aggModel = require('../models/agg');
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

const insertStds = async (payload) => {
  const conn = await dbConnection.connect();
  const M = conn.model(stdModel.modelName);

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

const insertAggs = async (payload) => {
  const conn = await dbConnection.connect();
  const M = conn.model(aggModel.modelName);

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
  insertStds,
  insertAggs,
  deletePools,
};
