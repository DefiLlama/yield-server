const dbConnection = require('../api/dbConnectionPostgres');
const AppError = require('../utils/appError');
const pgp = require('pg-promise')({
  /* initialization options */
  capSQL: true, // capitalize all generated SQL
});

module.exports.handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const pool = await dbConnection.connect();

  const timestamp = Number(event.pathParameters.timestamp);
  const project = event.pathParameters.project;
  const lb = new Date(timestamp * 1000).toISOString();
  const ub = new Date((timestamp + 86400) * 1000).toISOString();

  // we filter to a project and the current timestamp from midnight up to the next day midnight
  // eg timestamp 1649116800 == 2022-04-05T00:00:00.000Z
  // lb == 2022-04-05T00:00:00.000Z; ub == 2022-04-06T00:00:00.000Z
  // we remove everything >= lb up to < ub
  try {
    const query =
      'DELETE FROM pools WHERE project = $1 and timestamp >= $2 and timestamp < $3';
    const response = await pool.result(
      query,
      [project, lb, ub],
      (a) => a.rowCount
    );
    return {
      status: 'success',
      response,
    };
  } catch (err) {
    console.log(err);
    return new AppError("Couldn't delete data", 404);
  }
};
