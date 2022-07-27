const dbConnection = require('../utils/dbConnection.js');
const poolModel = require('../models/pool');
const AppError = require('../utils/appError');
const exclude = require('../utils/exclude');
const { aggQuery } = require('./getPools');

// get latest object of each unique pool
module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  const conn = await dbConnection.connect();
  const M = conn.model(poolModel.modelName);

  // add project field to match obj
  aggQuery.slice(-1)[0]['$match']['project'] = event.pathParameters.project;

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
