const minify = require('pg-minify');
const { pgp, connect } = require('../utils/dbConnectionPostgres');

const tableName = 'stat';

const getStat = async () => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        pool,
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
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
};

const insertStat = async (payload) => {
  const conn = await connect();

  const columns = [
    'pool',
    'count',
    'meanAPY',
    'mean2APY',
    'meanDR',
    'mean2DR',
    'productDR',
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });

  // multi-row insert/update
  const query =
    pgp.helpers.insert(payload, cs) +
    ' ON CONFLICT(pool) DO UPDATE SET ' +
    cs.assignColumns({ from: 'EXCLUDED', skip: 'pool' });

  const response = await conn.result(query);

  if (!response) {
    return new AppError(`Couldn't insert/update ${tableName} data`, 404);
  }

  return response;
};

module.exports = {
  getStat,
  insertStat,
};
