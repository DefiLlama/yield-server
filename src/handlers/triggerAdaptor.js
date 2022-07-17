const poolModel = require('../models/pool');
const AppError = require('../utils/appError');
const { boundaries } = require('../utils/exclude');
const dbConnection = require('../utils/dbConnection.js');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  console.log(event);

  // We return failed msg ids,
  // so that only failed messages will be retried by SQS in case of min of 1 error in batch
  // https://www.serverless.com/blog/improved-sqs-batch-error-handling-with-aws-lambda
  const failedMessageIds = [];

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      await main(body);
    } catch (err) {
      console.log(err);
      failedMessageIds.push(record.messageId);
    }
  }
  return {
    batchItemFailures: failedMessageIds.map((id) => {
      return {
        itemIdentifier: id,
      };
    }),
  };
};

// func for running adaptor, storing result to db (filtered) and s3 (unfiltered)
const main = async (body) => {
  // run adaptor
  console.log(body.adaptor);
  const project = require(`../adaptors/${body.adaptor}/index.js`);
  let data = await project.apy();

  // remove potential null/undefined objects in array
  data = data.filter((p) => p);

  // nullify potential NaN/undefined apy values
  data = data.map((p) => ({
    ...p,
    apy: isNaN(p.apy) ? null : p.apy,
    apyBase: isNaN(p.apyBase) ? null : p.apyBase,
    apyReward: isNaN(p.apyReward) ? null : p.apyReward,
  }));

  // remove pools where all 3 apy related fields are null
  data = data.filter(
    (p) => !(p.apy === null && p.apyBase === null && p.apyReward === null)
  );

  // derive final apy field via:
  data = data.map((p) => ({
    ...p,
    apy: p.apy ?? p.apyBase + p.apyReward,
  }));

  // add the timestamp field
  // will be rounded to the nearest hour
  // eg 2022-04-06T10:00:00.000Z
  const timestamp = new Date(
    Math.floor(Date.now() / 1000 / 60 / 60) * 60 * 60 * 1000
  );
  data = data
    .map((p) => ({ ...p, timestamp: timestamp }))
    // remove everything below LB ($1k)
    .filter((el) => el.tvlUsd >= boundaries.tvlUsdDB.lb);

  console.log('saving data to DB');
  const response = await insertPools(data);
  console.log(response);
};

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

module.exports.insertPools = insertPools;
