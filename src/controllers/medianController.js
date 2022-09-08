const minify = require('pg-minify');

const { pgp, connect } = require('../utils/dbConnection');

const tableName = 'median';

// get full content from median table
const getMedian = async () => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        timestamp,
        "uniquePools",
        "medianAPY"
    FROM
        $<table:name>
    ORDER BY
        timestamp ASC
    `,
    { compress: true }
  );

  const response = await conn.query(query, { table: tableName });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
};

// insert
const insertMedian = async (payload) => {
  const conn = await connect();

  const columns = ['timestamp', 'uniquePools', 'medianAPY'];
  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });
  const query = pgp.helpers.insert(payload, cs);
  const response = await conn.result(query);

  if (!response) {
    return new AppError(`Couldn't insert ${tableName} data`, 404);
  }

  return response;
};

module.exports = {
  getMedian,
  insertMedian,
};
