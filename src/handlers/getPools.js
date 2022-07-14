const dbConnection = require('../api/dbConnection.js');
const poolModel = require('../models/pool');
const AppError = require('../utils/appError');

// get latest object of each unique pool
module.exports.handler = async (event, context, callback) => {
  // Make sure to add this so you can re-use `conn` between function calls.
  // See https://www.mongodb.com/blog/post/serverless-development-with-nodejs-aws-lambda-mongodb-atlas
  context.callbackWaitsForEmptyEventLoop = false;

  // create/use existing connection
  const conn = await dbConnection.connect();

  const M = conn.model(poolModel.modelName);

  // pull only data >= 10k usd in tvl (we won't show smaller pools on the frontend)
  const tvlUsdLB = 1e4;

  // query consists of stages:
  // 1. match tvlUSd >= $10k
  // 2. sort entries by timestamp in descending order
  // 3. group by the pool returned the first objects fields
  // 4. sort again on tvl desc
  const aggQuery = [
    {
      $sort: {
        pool: 1,
        timestamp: -1,
      },
    },
    {
      $group: {
        _id: '$pool',
        chain: {
          $first: '$chain',
        },
        project: {
          $first: '$project',
        },
        symbol: {
          $first: '$symbol',
        },
        tvlUsd: {
          $first: '$tvlUsd',
        },
        apyBase: {
          $first: '$apyBase',
        },
        apyReward: {
          $first: '$apyReward',
        },
        apy: {
          $first: '$apy',
        },
        timestamp: {
          $first: '$timestamp',
        },
      },
    },
    // sort on tvl desc
    {
      $sort: {
        tvlUsd: -1,
      },
    },
    // adding "back" the pool field, the grouping key is only available as _id
    {
      $addFields: {
        pool: '$_id',
      },
    },
    // remove the _id field
    {
      $project: {
        _id: 0,
      },
    },
    // finally, remove pools below the tvl threshold
    { $match: { tvlUsd: { $gte: tvlUsdLB } } },
  ];

  const query = M.aggregate(aggQuery);
  const response = await query;

  if (!response) {
    return new AppError("Couldn't retrieve data", 404);
  }

  return {
    status: 'success',
    data: response,
  };
};
