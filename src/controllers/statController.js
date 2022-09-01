const { pgp, connect } = require('../utils/dbConnection');

const tableName = 'stat';

const getStat = async () => {
  const conn = await connect();

  const response = await conn.query('SELECT * FROM stat');

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
};

const insertStat = async (payload) => {
  const conn = await connect();

  const columns = [
    'stat_id',
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
    ' ON CONFLICT(stat_id) DO UPDATE SET ' +
    cs.assignColumns({ from: 'EXCLUDED', skip: 'stat_id' });

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
