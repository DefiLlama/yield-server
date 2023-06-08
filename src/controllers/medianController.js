const minify = require('pg-minify');

const { pgp, connect } = require('../utils/dbConnection');

const tableName = 'median';

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
  insertMedian,
};
