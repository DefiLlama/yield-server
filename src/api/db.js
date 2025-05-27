const pgp = require('pg-promise')({
  capSQL: true,
});
const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../config.env') });

pgp.pg.types.setTypeParser(20, parseInt);
pgp.pg.types.setTypeParser(1700, parseFloat);

const conn = pgp({
  host: process.env.POSTGRES_HOST,
  port: process.env.POSTGRES_PORT,
  user: process.env.POSTGRES_USER,
  password: process.env.POSTGRES_PASSWORD,
  database: process.env.POSTGRES_DATABASE,
  max: 5,
  idleTimeoutMillis: 3000,
});

module.exports = { pgp, conn };
