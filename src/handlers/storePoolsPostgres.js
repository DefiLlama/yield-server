const dbConnection = require('../api/dbConnectionPostgres');
const AppError = require('../utils/appError');
const pgp = require('pg-promise')({
  /* initialization options */
  capSQL: true, // capitalize all generated SQL
});

// returns enriched pool data
module.exports.handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const pool = await dbConnection.connect();

  const columns = [
    'pool',
    'chain',
    'project',
    'market',
    'symbol',
    'tvlUsd',
    'apy',
    'timestamp',
  ];
  // our set of columns, to be created only once (statically), and then reused,
  // to let it cache up its formatting templates for high performance:
  const cs = new pgp.helpers.ColumnSet(columns, { table: 'pools' });
  const payload = JSON.parse(event.body);
  // generating a multi-row insert query:
  const query = pgp.helpers.insert(payload, cs);

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
    return new AppError("Couldn't insert pool data", 404);
  }
};
