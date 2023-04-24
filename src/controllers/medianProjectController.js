const minify = require('pg-minify');

const { pgp, connect } = require('../utils/dbConnection');

const tableName = 'median_project';

// get full content from median table
const getMedianProject = async (project) => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        timestamp,
        "medianAPY",
        "uniquePools"
    FROM
        $<table:name>
    WHERE project = $<project>
    ORDER BY
        timestamp ASC
    `,
    { compress: true }
  );

  const response = await conn.query(query, { table: tableName, project });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
};

const insertMedianProject = async (payload) => {
  const conn = await connect();

  const columns = ['timestamp', 'project', 'medianAPY', 'uniquePools'];
  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });
  const query = pgp.helpers.insert(payload, cs);
  const response = await conn.result(query);

  if (!response) {
    return new AppError(`Couldn't insert ${tableName} data`, 404);
  }

  return response;
};

module.exports = {
  getMedianProject,
  insertMedianProject,
};
