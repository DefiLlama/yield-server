const minify = require('pg-minify');
const S3 = require('aws-sdk/clients/s3');

const { storeAPIResponse, next21Minutedate } = require('../utils/s3');
const AppError = require('../utils/appError');
const exclude = require('../utils/exclude');
const { pgp, conn } = require('../utils/dbConnection');

// get last DB entry per unique pool (with exclusion; this is what we use in enrichment handler)
const getYieldFiltered = async () => {
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
        "apyBaseInception"
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
    excludePools: exclude.excludePools,
    excludeProjects: exclude.excludeAdaptors,
  });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  return response;
};

// get last DB entry per unique pool for a given project (used by adapter handler to check for TVL spikes)
const getYieldProject = async (project) => {
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
      `,
    { compress: true }
  );

  const response = await conn.query(query, {
    tvlLB: exclude.boundaries.tvlUsdUI.lb,
    age: exclude.boundaries.age,
    project,
  });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  return response;
};

// get apy offset value for project/day combo
const getYieldOffset = async (project, offset) => {
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
                  yield AS y
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
  });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  return response;
};

const getYieldAvg30d = async () => {
  const query = minify(
    `
      SELECT
          "configID",
          round(avg(apy), 5) as "avgApy30d"
      FROM
          yield
      WHERE
          timestamp >= NOW() - INTERVAL '$<age> DAY'
      GROUP BY
          "configID"
    `,
    { compress: true }
  );

  const response = await conn.query(query, {
    age: 30,
  });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  // reformat
  const responseObject = {};
  for (const p of response) {
    responseObject[p.configID] = p.avgApy30d;
  }

  return responseObject;
};

const yieldLendBorrowQuery = minify(
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
                yield
            WHERE
                timestamp >= NOW() - INTERVAL '$<age> DAY'
            ORDER BY
                "configID",
                timestamp DESC
        ) AS y
        INNER JOIN config AS c ON c.config_id = y."configID"
    WHERE
        pool NOT IN ($<excludePools:csv>)
        AND project NOT IN ($<excludeProjects:csv>)
        AND ltv >= 0
        AND "totalSupplyUsd" >= 0
        AND symbol not like '%RENBTC%'
  `,
  { compress: true }
);

// get last DB entry per unique pool (lending/borrow fields only)
const getYieldLendBorrow = async () => {
  const response = await conn.query(yieldLendBorrowQuery, {
    tvlLB: exclude.boundaries.tvlUsdUI.lb,
    age: exclude.boundaries.age,
    excludePools: exclude.excludePools,
    excludeProjects: exclude.excludeAdaptors,
  });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
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
  const cs = new pgp.helpers.ColumnSet(columns, { table: 'yield' });
  return pgp.helpers.insert(payload, cs);
};

const buildInsertConfigQuery = (payload) => {
  const columns = [
    'config_id',
    'pool',
    'project',
    'chain',
    'symbol',
    // pg-promise is not aware of the db-schema -> we need to make sure that
    // optional fields are marked and provided with a default value
    // otherwise the `result` method will fail
    { name: 'poolMeta', def: null },
    { name: 'underlyingTokens', def: null },
    { name: 'rewardTokens', def: null },
    'url',
    { name: 'ltv', def: null },
    { name: 'borrowable', def: null },
    { name: 'mintedCoin', def: null },
    { name: 'borrowFactor', def: null },
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: 'config' });
  const query =
    pgp.helpers.insert(payload, cs) +
    ' ON CONFLICT(config_id) DO UPDATE SET ' +
    cs.assignColumns({ from: 'EXCLUDED', skip: 'config_id' });

  return query;
};

const insertConfigYieldTransaction = async (payload) => {
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

const getDistinctProjects = async () => {
  const query = `SELECT distinct project FROM config`;

  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  return response.map((i) => i.project);
};

const getConfigProject = async (project) => {
  const query = minify(
    `
    SELECT
        config_id,
        pool
    FROM
        config
    WHERE
        project = $<project>
    `,
    { compress: true }
  );

  const response = await conn.query(query, { project });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  return response;
};

const getStat = async () => {
  const query = minify(
    `
    SELECT
        "configID",
        count,
        "meanAPY",
        "mean2APY",
        "meanDR",
        "mean2DR",
        "productDR"
    FROM
        stat
    `,
    { compress: true }
  );

  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  // reformat
  const responseObject = {};
  for (const p of response) {
    const configID = p.configID;
    responseObject[configID] = { configID, ...p };
  }

  return responseObject;
};

const insertStat = async (payload) => {
  const columns = [
    'configID',
    'count',
    'meanAPY',
    'mean2APY',
    'meanDR',
    'mean2DR',
    'productDR',
  ];
  const cs = new pgp.helpers.ColumnSet(columns);

  const query =
    pgp.helpers.insert(payload, cs) +
    ' ON CONFLICT("configID") DO UPDATE SET ' +
    cs.assignColumns({ from: 'EXCLUDED', skip: 'configID' });

  const response = await conn.result(query);

  if (!response) {
    return new AppError(`Couldn't insert/update data`, 404);
  }

  return response;
};

const insertPerp = async (payload) => {
  const columns = [
    'timestamp',
    'marketplace',
    'market',
    'baseAsset',
    'fundingRate',
    'fundingRatePrevious',
    'fundingTimePrevious',
    'openInterest',
    'indexPrice',
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });
  const query = pgp.helpers.insert(payload, cs);

  const response = await conn.result(query);

  if (!response) {
    return new AppError(`Couldn't insert ${tableName} data`, 404);
  }

  return response;
};

const insertMedian = async (payload) => {
  const columns = ['timestamp', 'uniquePools', 'medianAPY'];
  const cs = new pgp.helpers.ColumnSet(columns, { table: 'median' });
  const query = pgp.helpers.insert(payload, cs);
  const response = await conn.result(query);

  if (!response) {
    return new AppError(`Couldn't insert data`, 404);
  }

  return response;
};

// get list of stale projects which are still active
// (have min 1 pool with tvl >= $1e4 and min 1 pool which has been
// updated within the last 7days)
const getStaleProjects = async () => {
  const query = minify(
    `
    SELECT
        project,
        date_trunc('second', NOW() - max(updated_at)) as stale_since,
        count(pool) AS nb_effected_pools
    FROM
        config
    GROUP BY
        project
    HAVING
        max(updated_at) <= NOW() - INTERVAL '$<minStaleHours> HOURS'
        AND project IN (
            SELECT
                DISTINCT(project)
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
            WHERE
                pool NOT IN ($<excludePools:csv>)
                AND project NOT IN ($<excludeProjects:csv>)
        )
    ORDER BY
        max(updated_at) ASC
    `,
    { compress: true }
  );

  const response = await conn.query(query, {
    tvlLB: exclude.boundaries.tvlUsdUI.lb,
    age: exclude.boundaries.age,
    excludePools: exclude.excludePools,
    excludeProjects: exclude.excludeAdaptors,
    // time (here hours) of min staleness
    // (i don't want to log right away but only after n-consecutive failures)
    minStaleHours: 6,
  });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  return response;
};

const buildPoolsEnriched = async (configID) => {
  const columns = [
    'chain',
    'project',
    'symbol',
    'tvlUsd',
    'apyBase',
    'apyReward',
    'apy',
    'rewardTokens',
    'pool',
    'apyPct1D',
    'apyPct7D',
    'apyPct30D',
    'stablecoin',
    'ilRisk',
    'exposure',
    'predictions',
    'poolMeta',
    'mu',
    'sigma',
    'count',
    'outlier',
    'underlyingTokens',
    'il7d',
    'apyBase7d',
    'apyMean30d',
    'volumeUsd1d',
    'volumeUsd7d',
    'apyBaseInception',
  ]
    .map((el) => `t."${el}"`)
    .join(', ');

  let query = `SELECT ${columns} FROM s3object[*][*] t`;

  if (queryString !== undefined) {
    query = `${query} where t.pool='${configID}'`;
  }

  const params = {
    Bucket: 'llama-apy-prod-data',
    Key: 'enriched/dataEnriched.json',
    ExpressionType: 'SQL',
    Expression: query,
    InputSerialization: {
      JSON: {
        Type: 'DOCUMENT',
      },
    },
    OutputSerialization: {
      JSON: {
        RecordDelimiter: ',',
      },
    },
  };

  const data = await getDataUsingS3Select(params);

  return data;
};

const getDataUsingS3Select = async (params) => {
  const s3 = new S3();

  return new Promise((resolve, reject) => {
    s3.selectObjectContent(params, (err, data) => {
      if (err) {
        reject(err);
      }

      if (!data) {
        reject('Empty data object');
      }

      // This will be an array of bytes of data, to be converted
      // to a buffer
      const records = [];

      // This is a stream of events
      data.Payload.on('data', (event) => {
        // There are multiple events in the eventStream, but all we
        // care about are Records events. If the event is a Records
        // event, there is data inside it
        if (event.Records) {
          records.push(event.Records.Payload);
        }
      })
        .on('error', (err) => {
          reject(err);
        })
        .on('end', () => {
          // Convert the array of bytes into a buffer, and then
          // convert that to a string
          let X = Buffer.concat(records).toString('utf8');

          // remove any trailing commas
          X = X.replace(/\,$/, '');

          // Add into JSON 'array'
          X = `[${X}]`;

          try {
            const out = JSON.parse(X);
            resolve(out);
          } catch (e) {
            reject(
              new Error(
                `Unable to convert S3 data to JSON object. S3 Select Query: ${params.Expression}`
              )
            );
          }
        });
    });
  });
};

const buildPoolsEnrichedOld = async (queryString) => {
  const columns = [
    'chain',
    'project',
    'symbol',
    'tvlUsd',
    'apyBase',
    'apyReward',
    'apy',
    'rewardTokens',
    'pool',
    'pool_old', // old pool field
    'apyPct1D',
    'apyPct7D',
    'apyPct30D',
    'stablecoin',
    'ilRisk',
    'exposure',
    'predictions',
    'poolMeta',
    'mu',
    'sigma',
    'count',
    'outlier',
    'underlyingTokens',
    'il7d',
    'apyBase7d',
    'apyMean30d',
    'volumeUsd1d',
    'volumeUsd7d',
    'apyBaseInception',
  ]
    .map((el) => `t."${el}"`)
    .join(', ');

  let query = `SELECT ${columns} FROM s3object[*][*] t`;

  if (queryString !== undefined) {
    query = `${query} where t.pool='${configID}'`;
  }

  const params = {
    Bucket: 'llama-apy-prod-data',
    Key: 'enriched/dataEnriched.json',
    ExpressionType: 'SQL',
    Expression: query,
    InputSerialization: {
      JSON: {
        Type: 'DOCUMENT',
      },
    },
    OutputSerialization: {
      JSON: {
        RecordDelimiter: ',',
      },
    },
  };

  const data = await getDataUsingS3Select(params);

  return data;
};

// /poolsOld runs lambda -> stores data to s3 (temp folder) and redirects so it reads from there
// instead of returning from lambda (which breaks the 6mb limit as we are already above that)
// applying redirect as in defillama-server
// (see: https://github.com/DefiLlama/defillama-server/blob/master/defi/src/getProtocol.ts#L50)
const redirectResponse = async (response) => {
  const filename = 'yields-poolsOld.json';
  // store /poolsEnriched (/pools) api response to s3 where we cache it
  await storeAPIResponse('defillama-datasets', `temp/${filename}`, {
    status: 'success',
    data: response,
  });
  return buildRedirect(filename);
};

const buildRedirect = (filename) => {
  return {
    statusCode: 307,
    body: '',
    headers: {
      Location: `https://defillama-datasets.s3.eu-central-1.amazonaws.com/temp/${filename}`,
      Expires: next21Minutedate(),
      'Access-Control-Allow-Origin': '*',
    },
  };
};

module.exports = {
  getYieldFiltered,
  getYieldOffset,
  getYieldProject,
  getYieldAvg30d,
  yieldLendBorrowQuery,
  getYieldLendBorrow,
  getDistinctProjects,
  getConfigProject,
  getStat,
  getStaleProjects,
  insertConfigYieldTransaction,
  insertStat,
  insertPerp,
  insertMedian,
  buildPoolsEnriched,
  getDataUsingS3Select,
  buildPoolsEnrichedOld,
  redirectResponse,
};
