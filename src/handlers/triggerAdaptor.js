const superagent = require('superagent');

const utils = require('../adaptors/utils');
const poolModel = require('../models/pool');
const urlModel = require('../models/url');
const { aggQuery } = require('./getPools');
const AppError = require('../utils/appError');
const exclude = require('../utils/exclude');
const dbConnection = require('../utils/dbConnection.js');
const { sendMessage } = require('../utils/discordWebhook');
const { insertUrl } = require('../controllers/urlController');
const { insertMeta } = require('../controllers/metaController');
const { insertYield } = require('../controllers/yieldController');

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

  // remove potential null/undefined objects in array
  data = data.filter((p) => p);

  // even though we have tests for datatypes, will need to guard against sudden changes
  // from api responses in terms of data types (eg have seen this on lido stETH) which went from
  // number to string. so in order for the below filters to work proplerly we need to guarantee that the
  // datatypes are correct (on db insert, mongoose checks field types against the schema and the bulk insert
  // will fail if a pools field types doesnt match)
  data = data.map((p) => ({
    ...p,
    apy: typeof p.apy === 'string' ? Number(p.apy) : p.apy,
    apyBase: typeof p.apyBase === 'string' ? Number(p.apyBase) : p.apyBase,
    apyReward:
      typeof p.apyReward === 'string' ? Number(p.apyReward) : p.apyReward,
  }));

  // filter tvl to be btw lb-ub
  data = data.filter(
    (p) =>
      p.tvlUsd >= exclude.boundaries.tvlUsdDB.lb &&
      p.tvlUsd <= exclude.boundaries.tvlUsdDB.ub
  );

  // nullify NaN, undefined or Infinity apy values
  data = data.map((p) => ({
    ...p,
    apy: Number.isFinite(p.apy) ? p.apy : null,
    apyBase: Number.isFinite(p.apyBase) ? p.apyBase : null,
    apyReward: Number.isFinite(p.apyReward) ? p.apyReward : null,
  }));

  // remove pools where all 3 apy related fields are null
  data = data.filter(
    (p) => !(p.apy === null && p.apyBase === null && p.apyReward === null)
  );

  // derive final total apy in case only apyBase and/or apyReward are given
  data = data.map((p) => ({
    ...p,
    apy: p.apy ?? p.apyBase + p.apyReward,
  }));

  // remove pools pools based on apy boundaries
  data = data.filter(
    (p) =>
      p.apy !== null &&
      p.apy >= exclude.boundaries.apy.lb &&
      p.apy <= exclude.boundaries.apy.ub
  );

  // remove exclusion pools
  data = data.filter((p) => !exclude.excludePools.includes(p.pool));

  // add the timestamp field
  // will be rounded to the nearest hour
  // eg 2022-04-06T10:00:00.000Z
  const timestamp = new Date(
    Math.floor(Date.now() / 1000 / 60 / 60) * 60 * 60 * 1000
  );
  data = data.map((p) => ({ ...p, timestamp: timestamp }));

  // format chain in case it was skipped in adapter.
  // round tvlUsd to integer and apy fields to n-dec
  const dec = 5;
  data = data.map((p) => ({
    ...p,
    chain: utils.formatChain(p.chain),
    symbol: utils.formatSymbol(p.symbol),
    tvlUsd: Math.round(p.tvlUsd),
    apy: +p.apy.toFixed(dec),
    apyBase: p.apyBase !== null ? +p.apyBase.toFixed(dec) : p.apyBase,
    apyReward: p.apyReward !== null ? +p.apyReward.toFixed(dec) : p.apyReward,
  }));

  // insert only if tvl conditions are ok:
  // if tvl
  // - has increased >5x since the last hourly update
  // - and has been updated in the last 5 hours
  // -> block update

  // load current project array
  const dataInitial = await getProject(body.adaptor);

  const dataDB = [];
  const nHours = 5;
  const tvlDeltaMultiplier = 5;
  const timedeltaLimit = 60 * 60 * nHours * 1000;
  const droppedPools = [];
  for (const p of data) {
    const x = dataInitial.find((e) => e.pool === p.pool);
    if (x === undefined) {
      dataDB.push(p);
      continue;
    }
    // if existing pool, check conditions
    const timedelta = timestamp - x.timestamp;
    // skip the update if tvl at t is ntimes larger than tvl at t-1 && timedelta condition is met
    if (
      p.tvlUsd > x.tvlUsd * tvlDeltaMultiplier &&
      timedelta < timedeltaLimit
    ) {
      console.log(`removing pool ${p.pool}`);
      droppedPools.push({
        pool: p.pool,
        symbol: p.symbol,
        project: p.project,
        tvlUsd: p.tvlUsd,
        tvlUsdDB: x.tvlUsd,
        tvlMultiplier: p.tvlUsd / x.tvlUsd,
        lastUpdate: x.timestamp,
        hoursUntilNextUpdate: 6 - timedelta / 1000 / 60 / 60,
      });
      continue;
    }
    dataDB.push(p);
  }

  if (
    !dataInitial.length &&
    dataDB.filter(({ tvlUsd }) => tvlUsd > 10000).length
  ) {
    const message = `Project ${body.adaptor} yields have been added`;
    await sendMessage(message, process.env.NEW_YIELDS_WEBHOOK);
  }

  const delta = data.length - dataDB.length;
  if (delta > 0) {
    console.log(`removed ${delta} sample(s) prior to insert`);
    // send discord message
    const filteredPools = droppedPools.filter((p) => p.tvlUsdDB >= 5e5);
    if (filteredPools.length) {
      const message = filteredPools
        .map(
          (p) =>
            `Project: ${p.project} Pool: ${p.pool} Symbol: ${
              p.symbol
            } TVL: from ${p.tvlUsdDB.toFixed()} to ${p.tvlUsd.toFixed()} (${p.tvlMultiplier.toFixed(
              2
            )}x increase)`
        )
        .join('\n');
      await sendMessage(message, process.env.TVL_SPIKE_WEBHOOK);
    }
  }

  const response = await insertPools(dataDB);
  console.log(response);

  // postgres
  const responseYield = await insertYield(dataDB);
  console.log(responseYield);
  const responseMeta = await insertMeta(dataDB);
  console.log(responseMeta);

  // update url
  if (project.url) {
    console.log('insert/update url');
    await updateUrl(body.adaptor, project.url);
    // postgres
    await insertUrl({ project: body.adaptor, link: project.url });
  }
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

// get latest object of each unique pool
const getProject = async (project) => {
  const conn = await dbConnection.connect();
  const M = conn.model(poolModel.modelName);

  // add project field to match obj
  aggQuery.slice(-1)[0]['$match']['project'] = project;

  const query = M.aggregate(aggQuery);
  let response = await query;

  // remove pools where all 3 fields are null (this and the below project/pool exclusion
  // could certainly be implemented in the aggregation pipeline but i'm to stupid for mongodb pipelines)
  response = response.filter(
    (p) =>
      !(p.apy === null && p.apyBase === null && p.apyReward === null) &&
      !exclude.excludePools.includes(p.pool)
  );

  return response;
};

const updateUrl = async (adapter, url) => {
  const conn = await dbConnection.connect();
  const M = conn.model(urlModel.modelName);

  const response = await M.bulkWrite([
    {
      updateOne: {
        filter: { project: adapter },
        update: {
          $set: {
            url: url,
          },
        },
        upsert: true,
      },
    },
  ]);

  if (!response) {
    return new AppError("Couldn't update data", 404);
  }
  console.log(response);
};
