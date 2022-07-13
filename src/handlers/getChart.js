const dbConnection = require('../api/dbConnection.js');
const poolModel = require('../models/pool');
const AppError = require('../utils/appError');
const { lambdaResponse } = require('../utils/lambda');

// retrieve chart data of latest daily tvl and apy values of requested pool
module.exports.handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const conn = await dbConnection.connect();
  const M = conn.model(poolModel.modelName);

  const pool = event.pathParameters.pool;

  const aggQuery = [
    {
      $match: {
        pool: pool,
      },
    },
    {
      $sort: {
        timestamp: -1,
      },
    },
    {
      $group: {
        _id: {
          $toDate: {
            $subtract: [
              { $toLong: '$timestamp' },
              { $mod: [{ $toLong: '$timestamp' }, 86400000] },
            ],
          },
        },
        apy: {
          $first: '$apy',
        },
        tvlUsd: {
          $first: '$tvlUsd',
        },
        timestamp: {
          $first: '$timestamp',
        },
      },
    },
    // remove the grouping key
    {
      $project: {
        _id: 0,
      },
    },
    {
      $sort: {
        timestamp: 1,
      },
    },
  ];

  const query = M.aggregate(aggQuery);
  const response = await query;

  if (!response) {
    return new AppError("Couldn't retrieve data", 404);
  }

  return lambdaResponse({
    status: 'success',
    data: response,
  });
};
