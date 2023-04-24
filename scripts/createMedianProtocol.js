const fs = require('fs');

const minify = require('pg-minify');

const { connect } = require('../src/utils/dbConnection');
const {
  insertMedianProject,
} = require('../src/controllers/medianProjectController');

const getMedianProject = async (project) => {
  const conn = await connect();

  const query = minify(
    `
WITH daily_data AS (
    SELECT
        "configID",
        DATE(timestamp) AS timestamp, 
        apy
    FROM yield
    WHERE "configID" IN (SELECT config_id FROM config WHERE project = $<project>)
    AND timestamp < current_date
)
SELECT timestamp,
        $<project> AS project,
        PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY apy) AS "medianAPY",
        count(distinct "configID") AS "uniquePools"
FROM daily_data
GROUP BY timestamp
ORDER BY timestamp;
    `,
    { compress: true }
  );

  const response = await conn.query(query, {
    project,
  });

  return response;
};

(async () => {
  const projects = fs
    .readdirSync('../src/adaptors')
    .filter((f) => !f.endsWith('.js') || f.endsWith('.json'));

  for (const project of projects) {
    const payload = await getMedianProject(project);
    if (payload.length < 1) continue;
    await insertMedianProject(payload);
    console.log(projects.indexOf(project), project, payload.length);
  }
})();
