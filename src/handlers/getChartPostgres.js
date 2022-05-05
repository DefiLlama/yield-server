const dbConnection = require('../api/dbConnectionPostgres');
const AppError = require('../utils/appError');

// returns enriched pool data
module.exports.handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const pool = await dbConnection.connect();

  const poolId = event.pathParameters.pool;
  const query = `
  SELECT * FROM pools 
  WHERE timestamp in (SELECT max(timestamp) FROM pools WHERE pool = $1 
  GROUP BY (timestamp::date)) and pool = $1 
  ORDER BY timestamp ASC
  `;

  const start = Date.now();
  const response = await pool.query(query, poolId);
  console.log('query took:', Date.now() - start);

  if (!response) {
    return new AppError("Couldn't get chart data", 404);
  }

  return {
    status: 'success',
    data: response,
  };
};
