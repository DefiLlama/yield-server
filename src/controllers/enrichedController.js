const AppError = require('../utils/appError');
const { pgp, connect } = require('../utils/dbConnectionPostgres');

const tableName = 'enriched';

const insertEnriched = async (payload) => {
  const conn = await connect();

  // all columns on payload, putting them here explicity on purpose instead of Object.keys(payload[0])
  const columns = [
    'enriched_id',
    'apyPct1D',
    'apyPct7D',
    'apyPct30D',
    'stablecoin',
    'ilRisk',
    'exposure',
    'predictions',
    'mu',
    'sigma',
    'count',
    'outlier',
    'return',
    'apyMeanExpanding',
    'apyStdExpanding',
    'chain_factorized',
    'project_factorized',
  ];

  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });

  // multi-row insert/update
  const query =
    pgp.helpers.insert(payload, cs) +
    ' ON CONFLICT(enriched_id) DO UPDATE SET ' +
    cs.assignColumns({ from: 'EXCLUDED', skip: 'enriched_id' });
  const response = await conn.result(query);

  if (!response) {
    return new AppError(`Couldn't insert ${tableName} data`, 404);
  }

  return {
    status: 'success',
    response: `Inserted ${payload.length} samples`,
  };
};

module.exports = {
  insertEnriched,
};
