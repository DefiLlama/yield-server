const dbConnection = require('../utils/dbConnection.js');
const poolModel = require('../models/pool');
const AppError = require('../utils/appError');
const exclude = require('../utils/exclude');
const { lambdaResponse } = require('../utils/lambda.js');

// get latest object of each unique pool
module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const response = await getLatestPools();

  if (!response) {
    return new AppError("Couldn't retrieve data", 404);
  }

  return lambdaResponse({
    status: 'success',
    data: response,
  });
};

const getLatestPools = async (aggregationQuery = aggQuery) => {
  const conn = await dbConnection.connect();
  const M = conn.model(poolModel.modelName);

  const query = M.aggregate(aggregationQuery);
  let response = await query;

  // remove pools where all 3 fields are null (this and the below project/pool exclusion
  // could certainly be implemented in the aggregation pipeline but i'm to stupid for mongodb pipelines)
  response = response.filter(
    (p) =>
      !(p.apy === null && p.apyBase === null && p.apyReward === null) &&
      !exclude.excludeAdaptors.includes(p.project) &&
      !exclude.excludePools.includes(p.pool)
  );

  return response;
};

const baseQuery = [
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
      rewardTokens: {
        $first: '$rewardTokens',
      },
      underlyingTokens: {
        $first: '$underlyingTokens',
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
];

// remove pools based on exclusion values
const aggQuery = [
  ...baseQuery,
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
      // remove pools which haven't been updated for >7days;
      // some pools might just not be included anymore in the adaptor output,
      // so instead of showing the latest object of that pool on the frontend
      timestamp: {
        $gte: new Date(new Date() - 60 * 60 * 24 * 7 * 1000),
      },
    },
  },
];

// remove pools based on exclusion values
const aggQueryMedian = [
  ...baseQuery,
  {
    $match: {
      // lte not enough, would remove null values,
      // hence why the or statement to keep pools with apy === null
      $or: [
        {
          apy: {
            $gte: 0,
            $lte: 1e6,
          },
        },
        { apy: null },
      ],
      // remove pools which haven't been updated for >7days;
      // some pools might just not be included anymore in the adaptor output,
      // so instead of showing the latest object of that pool on the frontend
      timestamp: {
        $gte: new Date(new Date() - 60 * 60 * 24 * 7 * 1000),
      },
    },
  },
];

module.exports.aggQuery = aggQuery;
module.exports.aggQueryMedian = aggQueryMedian;
module.exports.getLatestPools = getLatestPools;
