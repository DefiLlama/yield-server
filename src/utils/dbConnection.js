const path = require('path');

require('dotenv').config({ path: path.resolve(__dirname, '../../config.env') });
const logger = require("../utils/logger");

const pgp = require('pg-promise')({
  /* initialization options */
  capSQL: true, // capitalize all generated SQL
});
// set type options (pg-promise returns integers and numeric types as strings)
// id 20 = INTEGER
// id 1700 = NUMERIC
pgp.pg.types.setTypeParser(20, parseInt);
pgp.pg.types.setTypeParser(1700, parseFloat);

// on first connect, cache db connection for reuse so we don't
// need to connect on new requests
let conn = null;

const connect = async () => {
  if (conn === null) {
    logger.info('Starting new postgres connection');
    // set connection
    conn = pgp({
      host: process.env.POSTGRES_HOST,
      port: process.env.POSTGRES_PORT,
      user: process.env.POSTGRES_USER,
      password: process.env.POSTGRES_PASSWORD,
      database: process.env.POSTGRES_DATABASE,
      // max milliseconds a client can go unused before it is removed
      // from the connection pool and destroyed.
      // overriding default of 30sec to 60sec to decrease nb of potential reconnects of 1 lambda
      // running multiple adapters
      idleTimeoutMillis: 30000,
      max: 5,
    });
  }
  return conn;
};

// SIGTERM Handler
// from https://github.com/aws-samples/graceful-shutdown-with-aws-lambda
process.on('SIGTERM', async () => {
  logger.info('[runtime] SIGTERM received');

  logger.info('[runtime] cleaning up');
  if(conn !== null){
    let realConn = await conn
    await realConn.$pool.end()
    logger.info('Closed postgres connection');
  }
  
  logger.info('[runtime] exiting');
  process.exit(0)
});

module.exports = {
  pgp,
  connect,
};
