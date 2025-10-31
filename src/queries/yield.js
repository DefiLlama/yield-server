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
  // -- exclude if pool age > 7days (speeds up query)
  // -- join config data
  const query = `
  WITH wanted_cfg AS (
      SELECT *
      FROM   $<configTable:name>
      WHERE  pool    NOT IN ($<excludePools:csv>)
        AND  project NOT IN ($<excludeProjects:csv>)
        AND  symbol  NOT LIKE '%RENBTC%'
  )
  SELECT
      c.config_id          AS "configID",
      c.pool,
      y.timestamp,
      c.project,
      c.chain,
      c.symbol,
      c."poolMeta",
      c."underlyingTokens",
      c."rewardTokens",
      y."tvlUsd",
      y.apy,
      y."apyBase",
      y."apyReward",
      y."il7d",
      y."apyBase7d",
      CASE WHEN y."volumeUsd1d" < 0 THEN NULL ELSE y."volumeUsd1d" END AS "volumeUsd1d",
      CASE WHEN y."volumeUsd7d" < 0 THEN NULL ELSE y."volumeUsd7d" END AS "volumeUsd7d",
      y."apyBaseInception",
      c.url
  FROM   wanted_cfg AS c
  CROSS  JOIN LATERAL (
          SELECT *
          FROM   $<yieldTable:name>
          WHERE  "configID" = c.config_id
            AND "tvlUsd" >= $<tvlLB>
            AND  timestamp >= NOW() - INTERVAL '$<age> DAY'
          ORDER  BY timestamp DESC
          LIMIT  1
  ) AS y
  `;

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

const getLatestYieldForPool = async (configID) => {
  const conn = await connect();

  const query = `
  SELECT
      y."configID"        AS "configID",
      c.pool,
      y.timestamp,
      c.project,
      c.chain,
      c.symbol,
      c."poolMeta",
      c."underlyingTokens",
      c."rewardTokens",
      y."tvlUsd",
      y.apy,
      y."apyBase",
      y."apyReward",
      y."il7d",
      y."apyBase7d",
      CASE WHEN y."volumeUsd1d" < 0 THEN NULL ELSE y."volumeUsd1d" END AS "volumeUsd1d",
      CASE WHEN y."volumeUsd7d" < 0 THEN NULL ELSE y."volumeUsd7d" END AS "volumeUsd7d",
      y."apyBaseInception",
      c.url
  FROM   $<configTable:name> AS c
  CROSS  JOIN LATERAL (
          SELECT *
          FROM   $<yieldTable:name>
          WHERE  "configID" = $<configID>
            AND  timestamp  >= NOW() - INTERVAL '$<age> DAY'
          ORDER  BY timestamp DESC
          LIMIT  1
  ) AS y
  WHERE  c.config_id = $<configID>;
  `;

  const response = await conn.query(query, {
    configID,
    age: exclude.boundaries.age,
    yieldTable: tableName,
    configTable: configTableName,
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
  const query = `
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
    `;

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
  const query = `
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
    `;

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

  const query = `
  WITH wanted_cfg AS (
      SELECT *
      FROM   $<configTable:name>
      WHERE  pool    NOT IN ($<excludePools:csv>)
        AND  project NOT IN ($<excludeProjects:csv>)
        AND  symbol  NOT LIKE '%RENBTC%'
        AND  ltv BETWEEN 0 AND 1
  )
  SELECT
      c.config_id           AS pool,
      y."apyBaseBorrow",
      y."apyRewardBorrow",
      y."totalSupplyUsd",
      y."totalBorrowUsd",
      y."debtCeilingUsd",
      c.ltv,
      c.borrowable,
      c."mintedCoin",
      c."rewardTokens",
      c."underlyingTokens",
      c."borrowFactor"
  FROM   wanted_cfg AS c
  CROSS  JOIN LATERAL (
          SELECT *
          FROM   $<yieldTable:name>
          WHERE  "configID" = c.config_id
            AND  timestamp  >= NOW() - INTERVAL '$<age> DAY'
            AND  "totalSupplyUsd" >= 0
          ORDER  BY timestamp DESC
          LIMIT  1
  ) AS y;
  `;

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

  const query = `
    SELECT
        "configID",
        round(avg(apy), 5) as "avgApy30d"
    FROM
        $<table:name>
    WHERE
        timestamp >= NOW() - INTERVAL '$<age> DAY'
    GROUP BY
        "configID"
  `;

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
  getLatestYieldForPool,
  getYieldOffset,
  getYieldProject,
  getYieldLendBorrow,
  buildInsertYieldQuery,
  getYieldAvg30d,
};
