const { meta: sql } = require('../sql');
const { pgp, connect } = require('../utils/dbConnectionPostgres');

const tableName = 'meta';

const getMeta = async () => {
  const conn = await connect();

  const response = await conn.query(sql.getMeta);

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
};

const insertMeta = async (payload) => {
  const conn = await connect();

  const columns = [
    'pool',
    'symbol',
    'project',
    'chain',
    'poolMeta',
    'underlyingTokens',
    'rewardTokens',
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
