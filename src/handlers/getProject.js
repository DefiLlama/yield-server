const dbConnection = require('../utils/dbConnection.js');
const poolModel = require('../models/pool');
const AppError = require('../utils/appError');
const exclude = require('../utils/exclude');

// get latest object of each unique pool
module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const conn = await dbConnection.connect();
  const M = conn.model(poolModel.modelName);

  const project = event.pathParameters.project;

  const aggQuery = [
    {
      $match: {
        project: project,
      },
    },
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
    // finally, remove pools based on exclusion values
    {
      $match: {
        tvlUsd: {
          $gte: exclude.boundaries.tvlUsdUI.lb,
          $lte: exclude.boundaries.tvlUsdUI.ub,
        },
        // lte not enough, would remove null values,
        // hence why the or statement to keep pools with apy === null
        $or: [
          {
            apy: {
              $gte: exclude.boundaries.apy.lb,
              $lte: exclude.boundaries.apy.ub,
            },
          },
          { apy: null },
        ],
      },
    },
  ];

  const query = M.aggregate(aggQuery);
  let response = await query;

  // remove pools where all 3 fields are null (this and the below project/pool exclusion
  // could certainly be implemented in the aggregation pipeline but i'm to stupid for mongodb pipelines)
  response = response.filter(
    (p) =>
      !(p.apy === null && p.apyBase === null && p.apyReward === null) &&
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
