const dbConnection = require('../api/dbConnectionPostgres');
const AppError = require('../utils/appError');

// returns enriched pool data
module.exports.handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const pool = await dbConnection.connect();

  let query = 'SELECT * FROM enriched';
  const queryString = event.queryStringParameters;
  if (queryString !== undefined) {
    query = `${query} WHERE ${Object.keys(queryString)[0]} = '${
      Object.values(queryString)[0]
    }'`;
  }

  const start = Date.now();
  const response = await pool.query(query);
  console.log('query took:', Date.now() - start);

  if (!response) {
    return new AppError("Couldn't get enriched pool data", 404);
  }

  return {
    status: 'success',
    data: response,
  };
};
