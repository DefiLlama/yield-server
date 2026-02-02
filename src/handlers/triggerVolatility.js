const { connect } = require('../utils/dbConnection');

module.exports.handler = async (event, context) => {
  await main();
};

const main = async () => {
  console.log('REFRESHING VOLATILITY MATVIEW');

  const conn = await connect();
  await conn.query('REFRESH MATERIALIZED VIEW CONCURRENTLY volatility');

  console.log('DONE');
};
