const AppError = require('../utils/appError');
const { boundaries } = require('../utils/exclude');
const { yield: sql } = require('../sql');
const { pgp, connect } = require('../utils/dbConnectionPostgres');

const tableName = 'yield';

const getYieldPostgres = async () => {
  const conn = await connect();

  const response = await conn.query(sql.getYield, {
    tvlLB: boundaries.tvlUsdUI.lb,
    // age: boundaries.age,
    age: 30, // hardcoding for testing cause test data is older
  });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
};

const getYieldHistoryPostgres = async (pool) => {
  const conn = await connect();

  const response = await conn.query(sql.getYieldHistory, { poolValue: pool });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} history data`, 404);
  }

  return {
    status: 'success',
    data: response,
  };
};

const getYieldProjectPostgres = async (project) => {
  const conn = await connect();

  const response = await conn.query(sql.getYieldProject, {
    tvlLB: boundaries.tvlUsdUI.lb,
    // age: boundaries.age,
    age: 30, // hardcoding for testing cause test data is older
    project,
  });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} project data`, 404);
  }

  return response;
};

const getYieldOffsetPostgres = async (project, days) => {
  const conn = await connect();

  const daysMilliSeconds = Number(days) * 60 * 60 * 24 * 1000;
  const tOffset = Date.now() - daysMilliSeconds;

  // 3 hour window
  const h = 3;
  const tWindow = 60 * 60 * h * 1000;
  const tsLB = new Date(tOffset - tWindow);
  const tsUB = new Date(tOffset + tWindow);

  const tvlLB = boundaries.tvlUsdUI.lb;

  const response = await conn.query(sql.getYieldOffset, {
    project,
    age: days,
    tsLB,
    tsUB,
    tvlLB,
  });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} offset data`, 404);
  }

  return response;
};

const insertYieldPostgres = async (payload) => {
  const conn = await connect();

  const columns = [
    'pool',
    'tvlUsd',
    'apy',
    'apyBase',
    'apyReward',
    'timestamp',
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });
  // multi row insert
  const query = pgp.helpers.insert(payload, cs);
  const response = await conn.result(query);

  if (!response) {
    return new AppError(`Couldn't insert ${tableName} data`, 404);
  }

  return {
    status: 'success',
    response: `Inserted ${payload.length} samples`,
  };
};

module.exports = {
  getYieldPostgres,
  getYieldHistoryPostgres,
  getYieldOffsetPostgres,
  getYieldProjectPostgres,
  insertYieldPostgres,
};
