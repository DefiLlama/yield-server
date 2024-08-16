const AppError = require('../utils/appError');
const exclude = require('../utils/exclude');
const { pgp, connect } = require('../utils/dbConnection');

// get list of stale projects which are still active
const getStaleProjects = async () => {
  const conn = await connect();

  const query = `
WITH base AS (
    SELECT
        *
    FROM
        config
    WHERE
        pool NOT IN ($<excludePools:csv>)
        AND project NOT IN ($<excludeProjects:csv>)
)
SELECT
    project,
    date_trunc('second', NOW() - max(updated_at)) AS stale_since,
    count(pool) AS nb_effected_pools
FROM
    base
GROUP BY
    project
HAVING
    max(updated_at) >= NOW() - INTERVAL '$<age> days'
    AND max(updated_at) <= NOW() - INTERVAL '$<minStaleHours> HOURS'
ORDER BY
    max(updated_at) ASC
    `;

  const response = await conn.query(query, {
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

module.exports = { getStaleProjects };
