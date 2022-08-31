const minify = require('pg-minify');
const { pgp, connect } = require('../utils/dbConnectionPostgres');

const tableName = 'meta';

const getMeta = async () => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        pool,
        symbol,
        project,
        chain,
        "poolMeta",
        "underlyingTokens",
        "rewardTokens"
    FROM
        meta
    `,
    { compress: true }
  );

  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
};

const insertMeta = async (payload) => {
  const conn = await connect();

  const columns = [
    { name: 'pool' },
    { name: 'symbol' },
    { name: 'project' },
    { name: 'chain' },
    // pg-promise is not aware of the db-schema -> we need to make sure that
    // optional fields are marked and provided with a default value
    // otherwise the .result method will complain about missing fields
    //
    { name: 'poolMeta', def: null },
    { name: 'underlyingTokens', def: [] },
    { name: 'rewardTokens', def: [] },
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });

  // multi row insert/update
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
  getMeta,
  insertMeta,
};
