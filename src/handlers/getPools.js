const dbConnection = require('../api/dbConnection.js');
const poolModel = require('../models/pool');
const AppError = require('../utils/appError');
const exclude = require('../utils/exclude');

// get latest object of each unique pool
module.exports.handler = async (event, context, callback) => {
  // Make sure to add this so you can re-use `conn` between function calls.
  // See https://www.mongodb.com/blog/post/serverless-development-with-nodejs-aws-lambda-mongodb-atlas
  context.callbackWaitsForEmptyEventLoop = false;

  // create/use existing connection
  const conn = await dbConnection.connect();

  const M = conn.model(poolModel.modelName);

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
    // finally, remove pools based on exclusion values
    {
      $match: {
        tvlUsd: {
          $gte: exclude.boundaries.tvlUsdUI.lb,
          $lte: exclude.boundaries.tvlUsdUI.ub,
        },
        apy: { $ne: null, $lte: exclude.boundaries.apy.ub },
      },
    },
  ];

  const query = M.aggregate(aggQuery);
  let response = await query;

  // also removing projects and pools in the exclusion arrays (doing this here
  // because mongodb queries are just a pain in the ass)
  response = response.filter(
    (p) =>
      !exclude.excludeAdaptors.includes(p.project) &&
      !exclude.excludePools.includes(p.pool)
  );

  if (!response) {
    return new AppError("Couldn't retrieve data", 404);
  }

  return {
    status: 'success',
    data: response,
  };
};
