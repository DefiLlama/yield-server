require('dotenv').config({ path: '../../config.env' });
const pgp = require('pg-promise')({
  /* initialization options */
  capSQL: true, // capitalize all generated SQL
});
// set type options (pg-promise returns integers and numeric types as strings)
// id 20 = INTEGER
// id 1700 = NUMERIC
pgp.pg.types.setTypeParser(20, parseInt);
pgp.pg.types.setTypeParser(1700, parseFloat);

// const SSM = require('aws-sdk/clients/ssm');

// on first connect, cache db connection for reuse so we don't
// need to connect on new requests
let conn = null;

const connect = async () => {
  if (conn === null) {
    console.log('using new db connection');

    // // 1) retrieve db connection secrets from SSM
    // const ssm = new SSM();
    // const options = {
    //   Name: `${process.env.SSM_PATH}/dbconnectionPostgres`,
    //   WithDecryption: true,
    // };
    // let params = await ssm.getParameter(options).promise();
    // params = JSON.parse(params.Parameter.Value);

    // set connection
    // conn = pgp({
    //   user: params.user,
    //   database: params.database,
    //   password: params.password,
    //   port: params.port,
    //   host: params.host,
    // });
    conn = pgp({
      user: process.env.user,
      database: process.env.database,
      password: process.env.password,
      port: process.env.port,
      host: process.env.host,
    });
  } else {
    console.log('using existing db connection');
  }
  return conn;
};

module.exports = {
  pgp,
  connect,
};
