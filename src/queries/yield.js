const minify = require('pg-minify');

const AppError = require('../utils/appError');
const exclude = require('../utils/exclude');
const { pgp, connect } = require('../utils/dbConnection');
const { tableName: configTableName } = require('./config');

const tableName = 'yield';

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
        pool,
        timestamp,
        project,
        chain,
        symbol,
        "poolMeta",
        "underlyingTokens",
        "rewardTokens",
        "tvlUsd",
        apy,
        "apyBase",
        "apyReward",
        "il7d",
        "apyBase7d",
        "volumeUsd1d",
        "volumeUsd7d",
        "apyBaseInception",
        url
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
        AND symbol not like '%RENBTC%'
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
        apy,
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
const getYieldOffset = async (project, offset) => {
  const conn = await connect();

  const age = Number(offset);
  const daysMilliSeconds = age * 60 * 60 * 24 * 1000;
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
        abs_delta ASC
    `,
    { compress: true }
  );

  const response = await conn.query(query, {
    project,
    age,
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

// get last DB entry per unique pool (lending/borrow fields only)
const getYieldLendBorrow = async () => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        "configID" as pool,
        "apyBaseBorrow",
        "apyRewardBorrow",
        "totalSupplyUsd",
        "totalBorrowUsd",
        "debtCeilingUsd",
        "ltv",
        "borrowable",
        "mintedCoin",
        "rewardTokens",
        "underlyingTokens",
        "borrowFactor"
    FROM
        (
            SELECT
                DISTINCT ON ("configID") *
            FROM
                $<yieldTable:name>
            WHERE
                timestamp >= NOW() - INTERVAL '$<age> DAY'
            ORDER BY
                "configID",
                timestamp DESC
        ) AS y
        INNER JOIN $<configTable:name> AS c ON c.config_id = y."configID"
    WHERE
        pool NOT IN ($<excludePools:csv>)
        AND project NOT IN ($<excludeProjects:csv>)
        AND ltv BETWEEN 0 AND 1
        AND "totalSupplyUsd" >= 0
        AND symbol not like '%RENBTC%'
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

// get 30day avg
const getYieldAvg30d = async () => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        "configID",
        round(avg(apy), 5) as "avgApy30d"
    FROM
        $<table:name>
    WHERE
        timestamp >= NOW() - INTERVAL '$<age> DAY'
    GROUP BY
        "configID"
  `,
    { compress: true }
  );

  const response = await conn.query(query, {
    age: 30,
    table: tableName,
  });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} 30day avg data`, 404);
  }

  // reformat
  const responseObject = {};
  for (const p of response) {
    responseObject[p.configID] = p.avgApy30d;
  }

  return responseObject;
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
    'il7d',
    'apyBase7d',
    'apyRewardFake',
    'apyRewardBorrowFake',
    'volumeUsd1d',
    'volumeUsd7d',
    'apyBaseInception',
    { name: 'apyBaseBorrow', def: null },
    { name: 'apyRewardBorrow', def: null },
    { name: 'totalSupplyUsd', def: null },
    { name: 'totalBorrowUsd', def: null },
    { name: 'debtCeilingUsd', def: null },
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });
  return pgp.helpers.insert(payload, cs);
};

module.exports = {
  getYieldFiltered,
  getYieldOffset,
  getYieldProject,
  getYieldLendBorrow,
  buildInsertYieldQuery,
  getYieldAvg30d,
};
