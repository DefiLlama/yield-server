const { pgp, connect } = require('../utils/dbConnection');

module.exports.handler = async () => {
  await main();
};

const main = async () => {
  const conn = await connect();

  const query = `
INSERT INTO
    median_project (timestamp, project, "medianAPY", "uniquePools")
WITH today AS (
        SELECT
            "configID",
            apy
        FROM
            yield
        WHERE
            timestamp >= CURRENT_DATE
            AND apy > 0
            AND "tvlUsd" > 10000
    ),
    combined AS (
        SELECT
            t."configID" as "configID",
            t.apy AS apy,
            c.project AS project
        FROM
            today t
            JOIN config c ON t."configID" = c.config_id
    )
SELECT
    CURRENT_DATE AS timestamp,
    project,
    PERCENTILE_CONT(0.5) WITHIN GROUP (
        ORDER BY
            apy
    ) AS "medianAPY",
    count(distinct "configID") AS "uniquePools"
FROM
    combined
GROUP BY
    project

    `;

  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't insert into median_project data`, 404);
  }

  return response;
};
