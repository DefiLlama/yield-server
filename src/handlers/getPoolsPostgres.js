const dbConnection = require('../api/dbConnectionPostgres');
const AppError = require('../utils/appError');

// returns enriched pool data
module.exports.handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const pool = await dbConnection.connect();

  const query =
    'SELECT DISTINCT ON (pool) * FROM pools ORDER BY pool, timestamp desc';

  const start = Date.now();
  const response = await pool.query(query);
  console.log('query took:', Date.now() - start);

  if (!response) {
    return new AppError("Couldn't get pool data", 404);
  }

  return {
    status: 'success',
    data: response,
  };
};
