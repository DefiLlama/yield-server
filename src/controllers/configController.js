const { pgp, connect } = require('../utils/dbConnectionPostgres');

const tableName = 'config';

// get full content from config table
const getConfig = async () => {
  const conn = await connect();

  const response = await conn.query('SELECT * FROM config');

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
};

// return the insertConfig query which we use inside a transaction in adapter handler
const buildInsertConfigQuery = (payload) => {
  const columns = [
    'config_id',
    'pool',
    'project',
    'chain',
    'symbol',
    // pg-promise is not aware of the db-schema -> we need to make sure that
    // optional fields are marked and provided with a default value
    // otherwise the `result` method will fail
    { name: 'poolMeta', def: null },
    { name: 'underlyingTokens', def: [] },
    { name: 'rewardTokens', def: [] },
    'url',
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });

  // multi row insert/update
  const query =
    pgp.helpers.insert(payload, cs) +
    ' ON CONFLICT(config_id) DO UPDATE SET ' +
    cs.assignColumns({ from: 'EXCLUDED', skip: 'config_id' });

  return query;
};

module.exports = {
  getConfig,
  buildInsertConfigQuery,
};
