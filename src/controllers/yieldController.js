const minify = require('pg-minify');

const AppError = require('../utils/appError');
const { boundaries } = require('../utils/exclude');
const { pgp, connect } = require('../utils/dbConnectionPostgres');

const tableName = 'yield';

const getYield = async () => {
  const conn = await connect();

  // -- get latest yield row per unique pool id
  // -- exclude if tvlUsd is < LB
  // -- exclude if pool age > 7days
  // -- join meta data
  // -- NOTE: i use sqlformatter vscode extension. one issue i found is that it formats
  // -- named parameter placeholders such as $<tvlLB> to $ < tvlLB > which is invalid and
  // -- which pg-promise's internal formatter can't correct (at least i didn't find a way how to)
  // -- in order to get around this i'm using the formatter to generally format the query
  // -- but make sure to use cmd shift p -> save without formatting before pushing any changes to the repo
  const query = minify(
    `
    SELECT
        y.pool,
        symbol,
        chain,
        project,
        apy,
        "tvlUsd",
        "rewardTokens",
        "underlyingTokens",
        "poolMeta"
    FROM
        (
            SELECT
                DISTINCT ON (pool) *
            FROM
                yield
            WHERE
                "tvlUsd" >= $<tvlLB>
                AND timestamp >= NOW() - INTERVAL '$<age> DAY'
            ORDER BY
                pool,
                timestamp DESC
        ) AS y
        LEFT JOIN meta AS m ON y.pool = m.pool
  `,
    { compress: true }
  );

  const response = await conn.query(query, {
    tvlLB: boundaries.tvlUsdUI.lb,
    age: boundaries.age,
  });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
};

const getYieldHistory = async (pool) => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        timestamp,
        "tvlUsd",
        "apy"
    FROM
        yield
    WHERE
        timestamp IN (
            SELECT
                max(timestamp)
            FROM
                yield
            WHERE
                pool = $<poolValue>
            GROUP BY
                (timestamp :: date)
        )
        AND pool = $<poolValue>
    ORDER BY
        timestamp ASC
  `,
    { compress: true }
  );

  const response = await conn.query(query, { poolValue: pool });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} history data`, 404);
  }

  return {
    status: 'success',
    data: response,
  };
};

const getYieldProject = async (project) => {
  const conn = await connect();

  // -- get latest yield row per unique pool id for a specific project
  // -- exclude if tvlUsd is < LB
  // -- exclude if pool age > 7days
  // -- join meta data
  const query = minify(
    `
    SELECT
        y.pool,
        symbol,
        chain,
        project,
        apy,
        "tvlUsd",
        "rewardTokens",
        "underlyingTokens",
        "poolMeta"
    FROM
        (
            SELECT
                DISTINCT ON (pool) *
            FROM
                yield
            WHERE
                pool IN (
                    SELECT
                        *
                    FROM
                        (
                            SELECT
                                DISTINCT (pool)
                            FROM
                                meta
                            WHERE
                                "project" = $<project>
                        ) AS m
                )
                AND "tvlUsd" >= $<tvlLB>
                AND timestamp >= NOW() - INTERVAL '$<age> DAY'
            ORDER BY
                pool,
                timestamp DESC
        ) AS y
        LEFT JOIN meta AS m ON y.pool = m.pool
    `,
    { compress: true }
  );

  const response = await conn.query(query, {
    tvlLB: boundaries.tvlUsdUI.lb,
    age: boundaries.age,
    project,
  });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} project data`, 404);
  }

  return response;
};

const getYieldOffset = async (project, days) => {
  const conn = await connect();

  const daysMilliSeconds = Number(days) * 60 * 60 * 24 * 1000;
  const tOffset = Date.now() - daysMilliSeconds;

  // 3 hour window
  const h = 3;
  const tWindow = 60 * 60 * h * 1000;
  const tsLB = new Date(tOffset - tWindow);
  const tsUB = new Date(tOffset + tWindow);

  const tvlLB = boundaries.tvlUsdUI.lb;

  // -- retrieve the historical offset data for a every unique pool given an offset day (1d/7d/30d)
  // -- to calculate pct changes. allow some buffer (+/- 3hs) in case of missing data (via tsLB and tsUB)
  const query = minify(
    `
    SELECT
        DISTINCT ON (pool) pool,
        apy
    FROM
        (
            SELECT
                y.pool,
                apy,
                abs(
                    extract (
                        epoch
                        FROM
                            timestamp - (NOW() - INTERVAL '$<age> DAY')
                    )
                ) AS abs_delta
            FROM
                yield AS y
                LEFT JOIN meta AS m ON m.pool = y.pool
            WHERE
                "tvlUsd" >= $<tvlLB>
                AND project = $<project>
                AND timestamp >= $<tsLB>
                AND timestamp <= $<tsUB>
        ) y
    ORDER BY
        pool,
        abs_delta ASC
    `,
    { compress: true }
  );

  const response = await conn.query(query, {
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

const insertYield = async (payload) => {
  const conn = await connect();

  // note: even though apyBase and apyReward are optional fields
  // they are both added in the adapter handler to derive final apy.
  // hence, there is no need to specify optional fields defaults for pg-promise
  // (in contrast to `insertMeta`)
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
  getYield,
  getYieldHistory,
  getYieldOffset,
  getYieldProject,
  insertYield,
};
