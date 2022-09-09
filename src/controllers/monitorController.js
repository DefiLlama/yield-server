const minify = require('pg-minify');

const AppError = require('../utils/appError');
const exclude = require('../utils/exclude');
const { pgp, connect } = require('../utils/dbConnection');
const { tableName: configTableName } = require('./configController');

const tableName = 'yield';

// get list of stale projects which are still active
// (have min 1 pool with tvl >= $1e4 and min 1 pool which has been
// updated within the last 7days)
const getStaleProjects = async () => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        project,
        date_trunc('second', NOW() - max(updated_at)) as stale_since,
        count(pool) AS nb_effected_pools
    FROM
        $<configTable:name>
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
        )
    ORDER BY
        max(updated_at) ASC
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
    // time (here hours) of min staleness
    // (i don't want to log right away but only after n-consecutive failures)
    minStaleHours: 6,
  });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
};

module.exports = { getStaleProjects };
