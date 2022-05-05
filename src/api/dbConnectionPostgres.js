const pgp = require('pg-promise')({
  /* initialization options */
  capSQL: true, // capitalize all generated SQL
});
const SSM = require('aws-sdk/clients/ssm');

// on first connect, cache db connection for reuse so we don't
// need to connect on new requests
let conn = null;

exports.connect = async () => {
  if (conn === null) {
    console.log('using new db connection');

    const ssm = new SSM();
    const options = {
      Name: `${process.env.SSM_PATH}/dbtestpostgres`,
      WithDecryption: true,
    };
    let params = await ssm.getParameter(options).promise();
    params = JSON.parse(params.Parameter.Value);

    conn = pgp({
      user: params.user,
      database: params.database,
      password: params.password,
      port: params.port,
      host: params.host,
    });
  } else {
    console.log('using existing db connection');
  }
  return conn;
};
