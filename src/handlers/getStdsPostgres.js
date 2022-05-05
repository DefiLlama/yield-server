const dbConnection = require('../api/dbConnectionPostgres');
const AppError = require('../utils/appError');

// returns enriched pool data
module.exports.handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const pool = await dbConnection.connect();

  const query = 'SELECT pool, count, mean, mean2 FROM stds';

  const start = Date.now();
  const response = await pool.query(query);
  console.log('query took:', Date.now() - start);

  if (!response) {
    return new AppError("Couldn't get std data", 404);
  }

  return {
    status: 'success',
    data: response,
  };
};
