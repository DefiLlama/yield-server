const dbConnection = require('../api/dbConnectionPostgres');
const AppError = require('../utils/appError');

// returns enriched pool data
module.exports.handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const pool = await dbConnection.connect();

  const daysMilliSeconds =
    Number(event.pathParameters.days) * 60 * 60 * 24 * 1000;
  let tOffset = Date.now() - daysMilliSeconds;

  // 3 hour window
  const h = 3;
  const tWindow = 60 * 60 * h * 1000;
  // mongoose query requires Date
  const recent = new Date(tOffset + tWindow).toISOString();
  const oldest = new Date(tOffset - tWindow).toISOString();
  tOffset = new Date(tOffset).toISOString();
  const project = event.pathParameters.project;
  // pull only data >= 10k usd in tvl (we won't show smaller pools on the frontend)
  const tvlUsdLB = 1e4;

  const query = `
    SELECT DISTINCT ON (pool) apy, pool FROM (
        SELECT apy, pool, abs(extract (epoch from timestamp - $1)) as abs_delta FROM pools
        WHERE "tvlUsd" >= $2 and project = $3 and timestamp >= $4 and timestamp <= $5
        ) foo
        ORDER BY pool, abs_delta ASC
    `;

  const start = Date.now();
  const response = await pool.query(query, [
    tOffset,
    tvlUsdLB,
    project,
    oldest,
    recent,
  ]);
  console.log('query took:', Date.now() - start);

  if (!response) {
    return new AppError("Couldn't get offset data", 404);
  }

  return {
    status: 'success',
    data: response,
  };
};
