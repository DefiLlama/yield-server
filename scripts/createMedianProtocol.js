const fs = require('fs');
const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../config.env') });

const pgp = require('pg-promise')({
  capSQL: true,
});
pgp.pg.types.setTypeParser(20, parseInt);
pgp.pg.types.setTypeParser(1700, parseFloat);

const query = `
INSERT INTO
median_project (timestamp, project, "medianAPY", "uniquePools")
WITH daily_data AS (
  SELECT
      "configID",
      DATE(timestamp) AS timestamp,
      apy
  FROM yield
  WHERE "configID" IN (SELECT config_id FROM config WHERE project = $<project>)
  AND timestamp < current_date
  AND apy > 0
  AND "tvlUsd" > 10000
)
SELECT
      timestamp,
      $<project> AS project,
      PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY apy) AS "medianAPY",
      count(distinct "configID") AS "uniquePools"
FROM daily_data
GROUP BY timestamp
ORDER BY timestamp;
  `;

(async () => {
  const projects = fs
    .readdirSync('../src/adaptors')
    .filter((f) => !f.endsWith('.js') && !f.endsWith('.json'))
    .slice(204);

  const conn = pgp({
    connectionString: process.env.DATABASE_URL,
    idleTimeoutMillis: 5000,
    max: 1,
  });

  for (const project of projects) {
    const response = await conn.result(query, { project });
    console.log(projects.indexOf(project), project, response.rowCount);
  }
})();
