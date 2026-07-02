const axios = require('axios');

const utils = require('../adaptors/utils');
const AppError = require('../utils/appError');
const exclude = require('../utils/exclude');
const { derivePoolId } = require('../utils/poolId');
const { sendMessage } = require('../utils/discordWebhook');
const { connect } = require('../utils/dbConnection');
const { upsertAdapterStats } = require('../queries/adapterStats');
const { getYieldProject, buildInsertYieldQuery } = require('../queries/yield');
const {
  getConfigProject,
  buildInsertConfigQuery,
  getDistinctProjects,
} = require('../queries/config');

const ZERO_TVL_CATEGORIES = ['Lending', 'Uncollateralized Lending'];

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
  console.log(event);

  for (const record of event.Records) {
    const startedAt = new Date();
    let body;
    try {
      body = JSON.parse(record.body);
      await main(body);
      const finishedAt = new Date();
      await recordAdapterStats({
        adapter: body.adaptor,
        finishedAt,
        durationMs: finishedAt - startedAt,
        status: 'success',
      });
    } catch (err) {
      const finishedAt = new Date();
      console.log(err);
      await recordAdapterStats({
        adapter: body?.adaptor,
        finishedAt,
        durationMs: finishedAt - startedAt,
        status: 'error',
        error: formatErrorForStorage(err),
      });
    }
  }
};

const recordAdapterStats = async ({
  adapter,
  finishedAt,
  durationMs,
  status,
  error = null,
}) => {
  if (!adapter) return;

  try {
    await upsertAdapterStats({
      adapter,
      last_run_at: finishedAt,
      last_duration_ms: durationMs,
      last_status: status,
      last_error: error,
    });
  } catch (runtimeErr) {
    console.log('failed to update adapter stats');
    console.log(runtimeErr);
  }
};

const formatErrorForStorage = (err) => {
  const message = err?.stack || err?.message || String(err);
  return message.slice(0, 4000);
};

// func for running adaptor, storing result to db
const main = async (body) => {
  // ---------- run adaptor
  console.log(body.adaptor);
  const project = require(`../adaptors/${body.adaptor}`);
  let data = await project.apy();
  console.log(data[0]);

  const protocolConfig = (
    await axios.get('https://api.llama.fi/config/yields?a=1')
  ).data.protocols;
  const isLendingProject = ZERO_TVL_CATEGORIES.includes(
    protocolConfig[body.adaptor]?.category
  );

  // ---------- prepare prior insert
  // remove potential null/undefined objects in array
  data = data.filter((p) => p);

  // Skip routing-only rows in the legacy DB.
  if (['euler-v2', 'aave-v4', 'exactly'].includes(body.adaptor)) {
    data = data.filter((p) => p.poolKind !== 'routing_collateral');
    data = data.filter((p) => p.poolKind !== 'routing_reserve');
  }

  // cast dtypes
  // even though we have tests for datatypes, will need to guard against sudden changes
  // from api responses in terms of data types (eg have seen this on lido stETH) which went from
  // number to string. so in order for the below filters to work proplerly we need to guarantee that the
  // datatypes are correct (on db insert, mongoose checks field types against the schema and the bulk insert
  // will fail if a pools field types doesnt match)
  const strToNum = (val) => (typeof val === 'string' ? Number(val) : val);
  data = data.map((p) => ({
    ...p,
    apy: strToNum(p.apy),
    apyBase: strToNum(p.apyBase),
    apyReward: strToNum(p.apyReward),
    apyBaseBorrow: strToNum(p.apyBaseBorrow),
    apyRewardBorrow: strToNum(p.apyRewardBorrow),
    apyBase7d: strToNum(p.apyBase7d),
    apyRewardFake: strToNum(p.apyRewardFake),
    apyRewardBorrowFake: strToNum(p.apyRewardBorrowFake),
    apyBaseInception: strToNum(p.apyBaseInception),
    pricePerShare: strToNum(p.pricePerShare),
    availableBorrowUsd: strToNum(p.availableBorrowUsd),
  }));

  const getTvlForLowerBound = (p) =>
    isLendingProject && p.tvlUsd >= 0 && Number.isFinite(p.totalSupplyUsd)
      ? Math.max(p.tvlUsd, p.totalSupplyUsd)
      : p.tvlUsd;

  // Filter tvl to be within DB boundaries.
  data = data.filter(
    (p) =>
      getTvlForLowerBound(p) >= exclude.boundaries.tvlUsdDB.lb &&
      p.tvlUsd <= exclude.boundaries.tvlUsdDB.ub
  );

  // nullify NaN, undefined or Infinity apy values
  data = data.map((p) => ({
    ...p,
    apy: Number.isFinite(p.apy) ? p.apy : null,
    apyBase: Number.isFinite(p.apyBase) ? p.apyBase : null,
    apyReward: Number.isFinite(p.apyReward) ? p.apyReward : null,
    apyBaseBorrow: Number.isFinite(p.apyBaseBorrow) ? p.apyBaseBorrow : null,
    apyRewardBorrow: Number.isFinite(p.apyRewardBorrow)
      ? p.apyRewardBorrow
      : null,
    apyBase7d: Number.isFinite(p.apyBase7d) ? p.apyBase7d : null,
    apyRewardFake: Number.isFinite(p.apyRewardFake) ? p.apyRewardFake : null,
    apyRewardBorrowFake: Number.isFinite(p.apyRewardBorrowFake)
      ? p.apyRewardBorrowFake
      : null,
    apyBaseInception: Number.isFinite(p.apyBaseInception)
      ? p.apyBaseInception
      : null,
    pricePerShare:
      Number.isFinite(p.pricePerShare) && p.pricePerShare > 0
        ? p.pricePerShare
        : null,
  }));

  // remove pools where all 3 apy related fields are null
  data = data.filter(
    (p) => !(p.apy === null && p.apyBase === null && p.apyReward === null)
  );

  // in case of negative apy values (cause of bug, or else we set those to 0)
  // note: for options apyBase can be negative
  data = data.map((p) => ({
    ...p,
    apy: p.apy < 0 ? 0 : p.apy,
    apyBase:
      protocolConfig[body.adaptor]?.category === 'Options' ||
      ['mellow-protocol', 'sommelier', 'abracadabra', 'resolv', 'gami-labs'].includes(
        body.adaptor
      )
        ? p.apyBase
        : p.apyBase < 0
        ? 0
        : p.apyBase,
    apyReward: p.apyReward < 0 ? 0 : p.apyReward,
    apyBaseBorrow: p.apyBaseBorrow < 0 ? 0 : p.apyBaseBorrow,
    apyRewardBorrow: p.apyRewardBorrow < 0 ? 0 : p.apyRewardBorrow,
    apyBase7d: p.apyBase7d < 0 ? 0 : p.apyBase7d,
    apyRewardFake: p.apyRewardFake < 0 ? 0 : p.apyRewardFake,
    apyRewardBorrowFake: p.apyRewardBorrowFake < 0 ? 0 : p.apyRewardBorrowFake,
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

  // format chain symbol
  data = data.map((p) => ({ ...p, chain: utils.formatChain(p.chain) }));
  // change chain `Binance` -> `BSC`
  data = data.map((p) => ({
    ...p,
    chain:
      p.chain === 'Binance'
        ? 'BSC'
        : p.chain === 'Avax'
        ? 'Avalanche'
        : p.chain,
  }));
  console.log(data.length);

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
    // if pool not in mapping -> its a new pool -> mint the deterministic uuid
    // (uuidv5 of the pool key, same derivation as yield-server-v2), else keep existing one
    const id = mapping[p.pool] ?? derivePoolId(p.pool);
    return {
      ...p,
      config_id: id, // config PK field
      configID: id, // yield FK field referencing config_id in config
      symbol: ['usdc+', 'eth+', 'usdex+', 'usd0++', 'arb++'].some((i) =>
        p.symbol.toLowerCase().includes(i)
      )
        ? p.symbol
        : utils.formatSymbol(p.symbol),
      tvlUsd: Math.round(p.tvlUsd), // round tvlUsd to integer and apy fields to n-dec
      apy: +p.apy.toFixed(precision), // round apy fields
      apyBase: p.apyBase !== null ? +p.apyBase.toFixed(precision) : p.apyBase,
      apyReward:
        p.apyReward !== null ? +p.apyReward.toFixed(precision) : p.apyReward,
      url: p.url ?? project.url,
      timestamp,
      apyBaseBorrow:
        p.apyBaseBorrow !== null
          ? +p.apyBaseBorrow.toFixed(precision)
          : p.apyBaseBorrow,
      apyRewardBorrow:
        p.apyRewardBorrow !== null
          ? +p.apyRewardBorrow.toFixed(precision)
          : p.apyRewardBorrow,
      totalSupplyUsd:
        p.totalSupplyUsd === undefined || p.totalSupplyUsd === null
          ? null
          : Math.round(p.totalSupplyUsd),
      totalBorrowUsd:
        p.totalBorrowUsd === undefined || p.totalBorrowUsd === null
          ? null
          : Math.round(p.totalBorrowUsd),
      debtCeilingUsd:
        p.debtCeilingUsd === undefined || p.debtCeilingUsd === null
          ? null
          : Math.round(p.debtCeilingUsd),
      availableBorrowUsd:
        p.availableBorrowUsd === undefined || p.availableBorrowUsd === null
          ? null
          : Math.round(p.availableBorrowUsd),
      mintedCoin: p.mintedCoin ? utils.formatSymbol(p.mintedCoin) : null,
      poolMeta: p.poolMeta === undefined ? null : p.poolMeta,
      il7d: p.il7d ? +p.il7d.toFixed(precision) : null,
      apyBase7d:
        p.apyBase7d !== null ? +p.apyBase7d.toFixed(precision) : p.apyBase7d,
      apyRewardFake:
        p.apyRewardFake !== null
          ? +p.apyRewardFake.toFixed(precision)
          : p.apyRewardFake,
      apyRewardBorrowFake:
        p.apyRewardBorrowFake !== null
          ? +p.apyRewardBorrowFake.toFixed(precision)
          : p.apyRewardBorrowFake,
      volumeUsd1d:
        p.volumeUsd1d >= 0
          ? +parseFloat(p.volumeUsd1d).toFixed(precision)
          : null,
      volumeUsd7d:
        p.volumeUsd7d >= 0
          ? +parseFloat(p.volumeUsd7d).toFixed(precision)
          : null,
      apyBaseInception: p.apyBaseInception
        ? +p.apyBaseInception.toFixed(precision)
        : null,
      underlyingTokens: p.underlyingTokens?.filter(Boolean)?.length
        ? p.underlyingTokens.filter(Boolean)
        : null,
      rewardTokens: p.rewardTokens?.filter(Boolean)?.length
        ? p.rewardTokens.filter(Boolean)
        : null,
      searchTokenOverride: p.searchTokenOverride || null,
      token:
        'token' in p ? p.token || null : extractTokenFromPoolId(p.pool) || null,
      pricePerShare:
        p.pricePerShare !== null && p.pricePerShare !== undefined
          ? +p.pricePerShare.toFixed(precision)
          : null,
    };
  });

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
  const apyDeltaMultiplier = tvlDeltaMultiplier;
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
    // skip the update if tvl or apy at t is ntimes larger than tvl at t-1 && timedelta condition is met
    if (
      (p.tvlUsd > x.tvlUsd * tvlDeltaMultiplier ||
        p.apy > x.apy * apyDeltaMultiplier) &&
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
        apy: p.apy,
        apyDB: x.apy,
        apyMultiplier: p.apy / x.apy,
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
    const filteredPools = droppedPools.filter(
      (p) => p.tvlUsdDB >= 5e4 && p.apyDB >= 10
    );
    if (filteredPools.length) {
      const message = filteredPools
        .map((p) =>
          p.apyMultiplier >= apyDeltaMultiplier
            ? `APY spike for configID: ${
                p.configID
              } from ${p.apyDB.toFixed()} to ${p.apy.toFixed()} (${p.apyMultiplier.toFixed(
                2
              )}x increase) [tvlUsd: ${p.tvlUsd.toFixed()}]
          `
            : `TVL spike for configID: ${
                p.configID
              } from ${p.tvlUsdDB.toFixed()} to ${p.tvlUsd.toFixed()} (${p.tvlMultiplier.toFixed(
                2
              )}x increase)
            `
        )
        .join('\n');
      await sendMessage(message, process.env.TVL_SPIKE_WEBHOOK);
    }
  }

  // ---------- discord bot for newly added projects
  const distinctProjects = await getDistinctProjects();
  if (
    !distinctProjects.includes(body.adaptor) &&
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

function extractTokenFromPoolId(poolId) {
  if (!poolId || typeof poolId !== 'string') return null;
  const hexMatch = poolId.match(/(0x[a-fA-F0-9]{40,})(?![a-fA-F0-9])/);
  if (hexMatch) return hexMatch[1].toLowerCase();
  return null;
}

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
      throw new AppError('ConfigYield Transaction failed, rolling back', 404);
    });
};
