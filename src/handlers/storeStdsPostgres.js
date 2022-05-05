const dbConnection = require('../api/dbConnectionPostgres');
const AppError = require('../utils/appError');
const pgp = require('pg-promise')({
  /* initialization options */
  capSQL: true, // capitalize all generated SQL
});

// insert/update stds data
module.exports.handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const pool = await dbConnection.connect();

  const columns = ['count', 'mean', 'mean2', 'pool'];
  // our set of columns, to be created only once (statically), and then reused,
  // to let it cache up its formatting templates for high performance:
  const cs = new pgp.helpers.ColumnSet(columns, { table: 'stds' });

  const payload = JSON.parse(event.body);

  // generating a multi-row insert query, in case of conflict on pool (pool exists already),
  // do an update on all fields except the pool field
  const query =
    pgp.helpers.insert(payload, cs) +
    ' ON CONFLICT(pool) DO UPDATE SET ' +
    cs.assignColumns({ from: 'EXCLUDED', skip: 'pool' });

  try {
    const start = Date.now();
    response = await pool.result(query);
    console.log('query took:', Date.now() - start);
    return {
      status: 'success',
      data: response,
    };
  } catch (err) {
    console.log(err);
    return new AppError("Couldn't insert/update std data", 404);
  }
};
