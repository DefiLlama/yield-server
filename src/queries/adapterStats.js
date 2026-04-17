const { pgp, connect } = require('../utils/dbConnection');

const tableName = 'adapter_stats';

const upsertAdapterStats = async (payload) => {
  const conn = await connect();

  const columns = [
    'adapter',
    'last_run_at',
    'last_duration_ms',
    'last_status',
    { name: 'last_error', def: null },
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });
  const query =
    pgp.helpers.insert(payload, cs) +
    ' ON CONFLICT(adapter) DO UPDATE SET ' +
    cs.assignColumns({ from: 'EXCLUDED', skip: 'adapter' });

  return conn.result(query);
};

module.exports = {
  upsertAdapterStats,
};
