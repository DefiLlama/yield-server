const minify = require('pg-minify');

const AppError = require('../utils/appError');
const { pgp, connect } = require('../utils/dbConnectionPostgres');

const tableName = 'enriched';

const getEnriched = async () => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        pool,
        project,
        chain,
        symbol,
        "tvlUsd",
        apy,
        "apyBase",
        "apyReward",
        "poolMeta",
        "underlyingTokens",
        "rewardTokens",
        timestamp,
        "apyPct1D",
        "apyPct7D",
        "apyPct30D",
        stablecoin,
        "ilRisk",
        exposure,
        predictions,
        mu,
        sigma,
        count,
        outlier
    FROM
        enriched
    `,
    { compress: true }
  );

  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
};

const insertEnriched = async (payload) => {
  const conn = await connect();

  // all columns on payload, putting them here explicity on purpose instead of Object.keys(payload[0])
  const columns = [
    'pool',
    'project',
    'chain',
    'symbol',
    'tvlUsd',
    'apy',
    'apyBase',
    'apyReward',
    'poolMeta',
    'underlyingTokens',
    'rewardTokens',
    'timestamp',
    'apyPct1D',
    'apyPct7D',
    'apyPct30D',
    'stablecoin',
    'ilRisk',
    'exposure',
    'predictions',
    'mu',
    'sigma',
    'count',
    'outlier',
    'return',
    'apyMeanExpanding',
    'apyStdExpanding',
    'chain_factorized',
    'project_factorized',
  ];

  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });
  // multi row insert
  const query = pgp.helpers.insert(payload, cs);

  conn
    .tx(async (t) => {
      // first truncate the table
      await t.none('TRUNCATE $1', tableName);
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
      return new AppError(`Couldn't insert ${tableName} data`, 404);
    });
};

module.exports = {
  getEnriched,
  insertEnriched,
};
