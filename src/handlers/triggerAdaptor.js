const superagent = require('superagent');

const poolModel = require('../models/pool');
const AppError = require('../utils/appError');
const exclude = require('../utils/exclude');
const dbConnection = require('../utils/dbConnection.js');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  console.log(event);

  // We return failed msg ids,
  // so that only failed messages will be retried by SQS in case of min of 1 error init batch
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

// func for running adaptor, storing result to db
const main = async (body) => {
  // run adaptor
  console.log(body.adaptor);
  const project = require(`../adaptors/${body.adaptor}`);
  let data = await project.apy();

  // before storing the data into the db, we check for finite number values
  // and remove everything not defined within the allowed apy and tvl boundaries

  // 1. remove potential null/undefined objects in array
  data = data.filter((p) => p);

  // 2. filter tvl to be btw lb-ub
  data = data.filter(
    (p) =>
      p.tvlUsd >= exclude.boundaries.tvlUsdDB.lb &&
      p.tvlUsd <= exclude.boundaries.tvlUsdDB.ub
  );

  // 3. nullify NaN, undefined or Infinity apy values
  data = data.map((p) => ({
    ...p,
    apy: Number.isFinite(p.apy) ? p.apy : null,
    apyBase: Number.isFinite(p.apyBase) ? p.apyBase : null,
    apyReward: Number.isFinite(p.apyReward) ? p.apyReward : null,
  }));

  // 4. remove pools where all 3 apy related fields are null
  data = data.filter(
    (p) => !(p.apy === null && p.apyBase === null && p.apyReward === null)
  );

  // 5. derive final total apy in case only apyBase and/or apyReward are given
  data = data.map((p) => ({
    ...p,
    apy: p.apy ?? p.apyBase + p.apyReward,
  }));

  // 6. remove pools pools based on apy boundaries
  data = data.filter(
    (p) =>
      p.apy !== null &&
      p.apy >= exclude.boundaries.apy.lb &&
      p.apy <= exclude.boundaries.apy.ub
  );

  // 7. remove exclusion pools
  data = data.filter((p) => !exclude.excludePools.includes(p.pool));

  // 8. add the timestamp field
  // will be rounded to the nearest hour
  // eg 2022-04-06T10:00:00.000Z
  const timestamp = new Date(
    Math.floor(Date.now() / 1000 / 60 / 60) * 60 * 60 * 1000
  );
  data = data.map((p) => ({ ...p, timestamp: timestamp }));

  // 9. insert only if tvl conditions are ok:
  // if tvl
  // - has increased >5x since the last hourly update
  // - and has been updated in the last 5 hours
  // -> block update

  // load current project array
  // need a new endpoint for that
  const urlBase = process.env.APIG_URL;
  const dataInitial = (await superagent.get(`${urlBase}/pools/${body.adaptor}`))
    .body.data;

  const dataDB = [];
  for (const p of data) {
    const x = dataInitial.find((e) => e.pool === p.pool);
    if (x === undefined) {
      dataDB.push(p);
      continue;
    }
    // if existing pool, check conditions
    pctChange = (p.tvlUsd - x.tvlUsd) / x.tvlUsd;
    lastInsert = new Date(x.timestamp);
    timedelta = timestamp - lastInsert;
    const nHours = 5;
    timedeltaLimit = 60 * 60 * nHours * 1000;
    // skip the update if both pctChange and timedelta conditions are met
    if (pctChange > 5 && timedelta < timedeltaLimit) continue;
    dataDB.push(p);
  }
  if (dataDB.length < data.length)
    console.log(
      `removed ${data.length - dataDB.length} samples prior to insert`
    );

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
