const pgp = require('pg-promise')({
  capSQL: true,
});
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../config.env') });

pgp.pg.types.setTypeParser(20, parseInt);
pgp.pg.types.setTypeParser(1700, parseFloat);

const conn = pgp({
  connectionString: process.env.DATABASE_URL,
  max: 10,
  idleTimeoutMillis: 10000,
});

module.exports = { pgp, conn };
