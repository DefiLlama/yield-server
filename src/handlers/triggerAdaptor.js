const crypto = require('crypto');

const superagent = require('superagent');

const utils = require('../adaptors/utils');
const AppError = require('../utils/appError');
const exclude = require('../utils/exclude');
const { sendMessage } = require('../utils/discordWebhook');
const { connect } = require('../utils/dbConnection');
const {
  getYieldProject,
  buildInsertYieldQuery,
} = require('../controllers/yieldController');
const {
  getConfigProject,
  buildInsertConfigQuery,
} = require('../controllers/configController');

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
  // ---------- run adaptor
  console.log(body.adaptor);
  const project = require(`../adaptors/${body.adaptor}`);
  let data = await project.apy();

  // ---------- prepare prior insert
  // remove potential null/undefined objects in array
  data = data.filter((p) => p);

  // cast dtypes
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

  // in case of negative apy values (cause of bug, or else we set those to 0)
  data = data.map((p) => ({
    ...p,
    apy: p.apy < 0 ? 0 : p.apy,
    apyBase: p.apyBase < 0 ? 0 : p.apyBase,
    // this shouldn't be lower than 0 lol, but leaving it here anyways in case of bug in adapter
    apyReward: p.apyReward < 0 ? 0 : p.apyReward,
  }));

  // derive final total apy field
  data = data.map((p) => ({
    ...p,
    apy:
      // in case all three fields are given (which is redundant cause we calc the sum here),
      // we recalculate the total apy. reason: this takes into account any of the above 0 clips
      // which will result in a different sum than the adaptors output
      // (only applicable if all 3 fields are provided in the adapter
      // and if apBase and or apyReward < 0)
      p.apy !== null && p.apyBase !== null && p.apyReward !== null
        ? p.apyBase + p.apyReward
        : // all other cases for which we compute the sum only if apy is null/undefined
          p.apy ?? p.apyBase + p.apyReward,
  }));

  // remove pools based on apy boundaries
  data = data.filter(
    (p) =>
      p.apy !== null &&
      p.apy >= exclude.boundaries.apy.lb &&
      p.apy <= exclude.boundaries.apy.ub
  );

  // remove exclusion pools
  data = data.filter((p) => !exclude.excludePools.includes(p.pool));

  // for PK, FK, read data from config table
  const config = await getConfigProject(body.adaptor);
  const mapping = {};
  for (const c of config) {
    // the pool fields are used to map to the config_id values from the config table
    mapping[c.pool] = c.config_id;
  }

  // we round numerical fields to 5 decimals after the comma
  const precision = 5;
  const timestamp = new Date(Date.now());
  data = data.map((p) => {
    // if pool not in mapping -> its a new pool -> create a new uuid, else keep existing one
    const id = mapping[p.pool] ?? crypto.randomUUID();
    return {
      ...p,
      config_id: id, // config PK field
      configID: id, // yield FK field referencing config_id in config
      chain: utils.formatChain(p.chain), // format chain and symbol in case it was skipped in adapter
      symbol: utils.formatSymbol(p.symbol),
      tvlUsd: Math.round(p.tvlUsd), // round tvlUsd to integer and apy fields to n-dec
      apy: +p.apy.toFixed(precision), // round apy fields
      apyBase: p.apyBase !== null ? +p.apyBase.toFixed(precision) : p.apyBase,
      apyReward:
        p.apyReward !== null ? +p.apyReward.toFixed(precision) : p.apyReward,
      url: p.url ?? project.url,
      timestamp,
    };
  });

  // change chain `Binance` -> `BSC`
  data = data.map((p) => ({
    ...p,
    chain: p.chain === 'Binance' ? 'BSC' : p.chain,
  }));

  // ---------- tvl spike check
  // prior insert, we run a tvl check to make sure
  // that there haven't been any sudden spikes in tvl compared to the previous insert;
  // insert only if tvl conditions are ok:
  // if tvl
  // - has increased >10x since the last hourly update
  // - and has been updated in the last 5 hours
  // -> block update

  // load last entries for each pool for this sepcific adapter
  const dataInitial = await getYieldProject(body.adaptor);

  const dataDB = [];
  const nHours = 5;
  const tvlDeltaMultiplier = 5;
  const timedeltaLimit = 60 * 60 * nHours * 1000;
  const droppedPools = [];
  for (const p of data) {
    const x = dataInitial.find((e) => e.configID === p.configID);
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
        configID: p.configID,
        symbol: p.symbol,
        project: p.project,
        tvlUsd: p.tvlUsd,
        tvlUsdDB: x.tvlUsd,
        tvlMultiplier: p.tvlUsd / x.tvlUsd,
      });
      continue;
    }
    dataDB.push(p);
  }
  // return if dataDB is empty;
  if (!dataDB.length) return;

  // send msg to discord if tvl spikes
  const delta = data.length - dataDB.length;
  if (delta > 0) {
    console.log(`removed ${delta} sample(s) prior to insert`);
    // send discord message
    // we limit sending msg only if the pool's last tvlUsd value is >= $50k
    const filteredPools = droppedPools.filter((p) => p.tvlUsdDB >= 5e4);
    if (filteredPools.length) {
      const message = filteredPools
        .map(
          (p) =>
            `configID: ${p.configID} Project: ${p.project} Symbol: ${
              p.symbol
            } TVL: from ${p.tvlUsdDB.toFixed()} to ${p.tvlUsd.toFixed()} (${p.tvlMultiplier.toFixed(
              2
            )}x increase)`
        )
        .join('\n');
      await sendMessage(message, process.env.TVL_SPIKE_WEBHOOK);
    }
  }

  // ---------- discord bot for newly added projects
  if (
    !dataInitial.length &&
    dataDB.filter(({ tvlUsd }) => tvlUsd > exclude.boundaries.tvlUsdUI.lb)
      .length
  ) {
    const message = `Project ${body.adaptor} yields have been added`;
    await sendMessage(message, process.env.NEW_YIELDS_WEBHOOK);
  }

  // ---------- DB INSERT
  const response = await insertConfigYieldTransaction(dataDB);
  console.log(response);
};

// --------- transaction query
const insertConfigYieldTransaction = async (payload) => {
  const conn = await connect();

  // build queries
  const configQ = buildInsertConfigQuery(payload);
  const yieldQ = buildInsertYieldQuery(payload);

  return conn
    .tx(async (t) => {
      // sequence of queries:
      // 1. config: insert/update
      const q1 = await t.result(configQ);
      // 2. yield: insert
      const q2 = await t.result(yieldQ);

      return [q1, q2];
    })
    .then((response) => {
      // success, COMMIT was executed
      return {
        status: 'success',
        data: response,
      };
    })
    .catch((err) => {
      // failure, ROLLBACK was executed
      console.log(err);
      return new AppError('ConfigYield Transaction failed, rolling back', 404);
    });
};
