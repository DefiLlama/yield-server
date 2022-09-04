const minify = require('pg-minify');

const AppError = require('../utils/appError');
const exclude = require('../utils/exclude');
const { pgp, connect } = require('../utils/dbConnection');
const {
  tableName: configTableName,
} = require('../controllers/configController');

const tableName = 'yield';

// get last DB entry per unique pool (with no exclusion; required by triggerStat handler)
const getYield = async () => {
  const conn = await connect();

  // -- get latest yield row per unique configID (a pool)
  const query = minify(
    `
    SELECT
        DISTINCT ON ("configID") "configID",
        apy
    FROM
        $<table:name>
    ORDER BY
        "configID",
        timestamp DESC
  `,
    { compress: true }
  );

  const response = await conn.query(query, { table: tableName });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
};

// get last DB entry per unique pool (with exclusion; this is what we use in enrichment handler)
const getYieldFiltered = async () => {
  const conn = await connect();

  // -- get latest yield row per unique configID (a pool)
  // -- exclude if tvlUsd is < LB
  // -- exclude if pool age > 7days
  // -- join config data
  const query = minify(
    `
    SELECT
        "configID",
        timestamp,
        pool,
        project,
        chain,
        symbol,
        "poolMeta",
        "underlyingTokens",
        "rewardTokens",
        "tvlUsd",
        apy,
        "apyBase",
        "apyReward"
    FROM
        (
            SELECT
                DISTINCT ON ("configID") *
            FROM
                $<yieldTable:name>
            WHERE
                "tvlUsd" >= $<tvlLB>
                AND timestamp >= NOW() - INTERVAL '$<age> DAY'
            ORDER BY
                "configID",
                timestamp DESC
        ) AS y
        INNER JOIN $<configTable:name> AS c ON c.config_id = y."configID"
    WHERE
        pool NOT IN ($<excludePools:csv>)
        AND project NOT IN ($<excludeProjects:csv>)
  `,
    { compress: true }
  );

  const response = await conn.query(query, {
    tvlLB: exclude.boundaries.tvlUsdUI.lb,
    age: exclude.boundaries.age,
    yieldTable: tableName,
    configTable: configTableName,
    excludePools: exclude.excludePools,
    excludeProjects: exclude.excludeAdaptors,
  });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
};

// get full history of given configID
const getYieldHistory = async (configID) => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        timestamp,
        "tvlUsd",
        "apy"
    FROM
        $<table:name>
    WHERE
        timestamp IN (
            SELECT
                max(timestamp)
            FROM
                $<table:name>
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

  const response = await conn.query(query, {
    configIDValue: configID,
    table: tableName,
  });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} history data`, 404);
  }

  return {
    status: 'success',
    data: response,
  };
};

// get last DB entry per unique pool for a given project (used by adapter handler to check for TVL spikes)
const getYieldProject = async (project) => {
  const conn = await connect();

  // -- get latest yield row per unique configID (a pool) for a specific project
  // -- exclude if tvlUsd is < LB
  // -- exclude if pool age > 7days
  // -- join config data
  const query = minify(
    `
    SELECT
        DISTINCT ON ("configID") "configID",
        "tvlUsd",
        timestamp
    FROM
        $<yieldTable:name>
    WHERE
        "configID" IN (
            SELECT
                DISTINCT (config_id)
            FROM
                $<configTable:name>
            WHERE
                "project" = $<project>
        )
        AND "tvlUsd" >= $<tvlLB>
        AND timestamp >= NOW() - INTERVAL '$<age> DAY'
    ORDER BY
        "configID",
        timestamp DESC
    `,
    { compress: true }
  );

  const response = await conn.query(query, {
    tvlLB: exclude.boundaries.tvlUsdUI.lb,
    age: exclude.boundaries.age,
    project,
    yieldTable: tableName,
    configTable: configTableName,
  });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} project data`, 404);
  }

  return response;
};

// get apy offset value for project/day combo
const getYieldOffset = async (project, days) => {
  const conn = await connect();

  const daysMilliSeconds = Number(days) * 60 * 60 * 24 * 1000;
  const tOffset = Date.now() - daysMilliSeconds;

  // 3 hour window
  const h = 3;
  const tWindow = 60 * 60 * h * 1000;
  const tsLB = new Date(tOffset - tWindow);
  const tsUB = new Date(tOffset + tWindow);

  const tvlLB = exclude.boundaries.tvlUsdUI.lb;

  // -- retrieve the historical offset data for a every unique pool given an offset day (1d/7d/30d)
  // -- to calculate pct changes. allow some buffer (+/- 3hs) in case of missing data (via tsLB and tsUB)
  const query = minify(
    `
    SELECT
        DISTINCT ON ("configID") "configID",
        apy
    FROM
        (
            SELECT
                "configID",
                apy,
                abs(
                    extract (
                        epoch
                        FROM
                            timestamp - (NOW() - INTERVAL '$<age> DAY')
                    )
                ) AS abs_delta
            FROM
                $<table:name> AS y
                INNER JOIN config AS c ON c.config_id = y."configID"
            WHERE
                "tvlUsd" >= $<tvlLB>
                AND project = $<project>
                AND timestamp >= $<tsLB>
                AND timestamp <= $<tsUB>
        ) AS y
    ORDER BY
        "configID",
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
    table: tableName,
  });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} offset data`, 404);
  }

  return response;
};

// multi row insert query generator
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
  return pgp.helpers.insert(payload, cs);
};

module.exports = {
  getYield,
  getYieldFiltered,
  getYieldHistory,
  getYieldOffset,
  getYieldProject,
  buildInsertYieldQuery,
};
