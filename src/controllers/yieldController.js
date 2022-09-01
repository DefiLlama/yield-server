const minify = require('pg-minify');

const AppError = require('../utils/appError');
const { boundaries } = require('../utils/exclude');
const { pgp, connect } = require('../utils/dbConnection');

const tableName = 'yield';

const getYield = async () => {
  const conn = await connect();

  // -- get latest yield row per unique configID (a pool)
  // -- exclude if tvlUsd is < LB
  // -- exclude if pool age > 7days
  // -- join config data
  // -- NOTE: i use sqlformatter vscode extension. one issue i found is that it formats
  // -- named parameter placeholders such as $<tvlLB> to $ < tvlLB > which is invalid and
  // -- which pg-promise's internal formatter can't correct (at least i didn't find a way how to)
  // -- in order to get around this i'm using the formatter to generally format the query
  // -- but make sure to use cmd shift p -> save without formatting before pushing any changes to the repo
  const query = minify(
    `
    SELECT
        "configID",
        timestamp,
        "tvlUsd",
        apy,
        "apyBase",
        "apyReward",
        pool,
        project,
        chain,
        symbol,
        "poolMeta",
        "underlyingTokens",
        "rewardTokens"
        "url"
    FROM
        (
            SELECT
                DISTINCT ON ("configID") *
            FROM
                yield
            WHERE
                "tvlUsd" >= $<tvlLB>
                AND timestamp >= NOW() - INTERVAL '$<age> DAY'
            ORDER BY
                "configID",
                timestamp DESC
        ) AS y
        INNER JOIN config AS c ON c.config_id = y."configID"
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

const getYieldHistory = async (configID) => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        distinct(timestamp),
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
                "configID" = $<configIDValue>
            GROUP BY
                (timestamp :: date)
        )
        AND "configID" = $<configIDValue>
    ORDER BY
        timestamp ASC
  `,
    { compress: true }
  );

  const response = await conn.query(query, { configIDValue: configID });

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

  // -- get latest yield row per unique configID (a pool) for a specific project
  // -- exclude if tvlUsd is < LB
  // -- exclude if pool age > 7days
  // -- join config data
  const query = minify(
    `
    SELECT
        "configID",
        pool,
        "tvlUsd"
    FROM
        (
            SELECT
                DISTINCT ON ("configID") *
            FROM
                yield
            WHERE
                "configID" IN (
                    SELECT
                        DISTINCT (config_id)
                    FROM
                        config
                    WHERE
                        "project" = $<project>
                )
                AND "tvlUsd" >= $<tvlLB>
                AND timestamp >= NOW() - INTERVAL '$<age> DAY'
            ORDER BY
                "configID",
                timestamp DESC
        ) AS y
        INNER JOIN config AS c ON c.config_id = y."configID"
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
                "configID",
                pool,
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
                INNER JOIN config AS c ON c.config_id = y."configID"
            WHERE
                "tvlUsd" >= $<tvlLB>
                AND project = $<project>
                AND timestamp >= $<tsLB>
                AND timestamp <= $<tsUB>
        ) AS y
    ORDER BY
        pool,
        abs_delta DESC
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

const buildInsertYieldQuery = (payload) => {
  // note: even though apyBase and apyReward are optional fields
  // they are both added in the adapter handler to derive final apy.
  // hence, there is no need to specify optional fields defaults for pg-promise
  // (in contrast to some fields in `insertConfig`)
  const columns = [
    'configID',
    'timestamp',
    'tvlUsd',
    'apy',
    'apyBase',
    'apyReward',
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });
  // multi row insert
  return pgp.helpers.insert(payload, cs);
};

module.exports = {
  getYield,
  getYieldHistory,
  getYieldOffset,
  getYieldProject,
  buildInsertYieldQuery,
};
