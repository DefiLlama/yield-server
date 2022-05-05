const dbConnection = require('../api/dbConnectionPostgres');
const AppError = require('../utils/appError');
const pgp = require('pg-promise')({
  /* initialization options */
  capSQL: true, // capitalize all generated SQL
});

// store enriched data
module.exports.handler = async (event, context, callback) => {
  context.callbackWaitsForEmptyEventLoop = false;

  const pool = await dbConnection.connect();

  const columns = [
    'chain',
    'project',
    'symbol',
    'tvlUsd',
    'apy',
    'apyPct1D',
    'apyPct7D',
    'apyPct30D',
    'projectName',
    'stablecoin',
    'ilRisk',
    'exposure',
    'predictedClass',
    'predictedProbability',
  ];
  // our set of columns, to be created only once (statically), and then reused,
  // to let it cache up its formatting templates for high performance:
  const cs = new pgp.helpers.ColumnSet(columns, { table: 'enriched' });
  const payload = JSON.parse(event.body);
  // generating a multi-row insert query:
  const query = pgp.helpers.insert(payload, cs);

  pool
    .tx(async (t) => {
      // first truncate the table
      await t.none('TRUNCATE enriched');
      // then insert the new sample
      await t.result(query);
    })
    .then((response) => {
      // success, COMMIT was executed
      return {
        status: 'success',
        data: response,
      };
    })
    .catch((err) => {
      // failure, ROLLBACK was executed
      console.log(err);
      return new AppError("Couldn't insert pool data", 404);
    });
};
