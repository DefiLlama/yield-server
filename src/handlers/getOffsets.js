const dbConnection = require('../utils/dbConnection.js');
const poolModel = require('../models/pool');
const AppError = require('../utils/appError');

// retrieve the historical offset data for a project and a given offset day (1d/7d/30d)
// to calculate pct changes. allow some buffer (+/- 3hs) in case of missing data
module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const conn = await dbConnection.connect();
  const M = conn.model(poolModel.modelName);

  const daysMilliSeconds =
    Number(event.pathParameters.days) * 60 * 60 * 24 * 1000;
  const tOffset = Date.now() - daysMilliSeconds;

  // 3 hour window
  const h = 3;
  const tWindow = 60 * 60 * h * 1000;
  // mongoose query requires Date
  const recent = new Date(tOffset + tWindow);
  const oldest = new Date(tOffset - tWindow);

  // pull only data >= 10k usd in tvl (we won't show smaller pools on the frontend)
  const tvlUsdLB = 1e4;

  const aggQuery = [
    // filter
    {
      $match: {
        project: event.pathParameters.project,
        timestamp: {
          $gte: oldest,
          $lte: recent,
        },
        tvlUsd: { $gte: tvlUsdLB },
      },
    },
    // calc time distances from exact offset
    {
      $addFields: {
        time_dist: {
          $abs: [{ $subtract: ['$timestamp', new Date(tOffset)] }],
        },
      },
    },
    // sort ascending (the smallest distance are the closest data points to the exact offset)
    {
      $sort: { time_dist: 1 },
    },
    // group by id, and return the first sample of apy
    {
      $group: {
        _id: '$pool',
        apy: {
          $first: '$apy',
        },
      },
    },
    // adding "back" the pool field, the grouping key is only available as _id
    {
      $addFields: {
        pool: '$_id',
      },
    },
    // remove the grouping key
    {
      $project: {
        _id: 0,
      },
    },
  ];
  const query = M.aggregate(aggQuery);

  // run query on db server
  const response = await query;

  if (!response) {
    return new AppError("Couldn't retrieve data", 404);
  }

  return {
    status: 'sucess',
    data: {
      timestampExact: tOffset,
      offsets: response,
    },
  };
};
