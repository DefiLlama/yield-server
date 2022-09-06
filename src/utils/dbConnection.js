const mongoose = require('mongoose');
const SSM = require('aws-sdk/clients/ssm');

// https://mongoosejs.com/docs/lambda.html
// Because conn is in the global scope, Lambda may retain it between
// function calls thanks to `callbackWaitsForEmptyEventLoop`.
// This means your Lambda function doesn't have to go through the
// potentially expensive process of connecting to MongoDB every time.

// more about callbackWaitsForEmptyEventLoop (which we add to every lambda which makes
// a connection to the db)
// See https://www.mongodb.com/blog/post/serverless-development-with-nodejs-aws-lambda-mongodb-atlas

// on first connect, cache db connection for reuse so we don't
// need to connect on new requests
let conn = null;

exports.connect = async () => {
  if (conn === null) {
    console.log('using new db connection');

    // 1) retrieve db connection secrets from SSM
    const ssm = new SSM();
    const options = {
      Name: `${process.env.SSM_PATH}/dbconnection`,
      WithDecryption: true,
    };
    let params = await ssm.getParameter(options).promise();
    params = JSON.parse(params.Parameter.Value);

    const DB = params.database.replace('<password>', params.database_password);
    // set conection
    conn = mongoose
      .connect(DB, {
        useNewUrlParser: true,
        useCreateIndex: true,
        useFindAndModify: false,
        useUnifiedTopology: true,
        // and tell the MongoDB driver to not wait more than 5 seconds
        // before erroring out if it isn't connected
        serverSelectionTimeoutMS: 5000,
      })
      .then(() => mongoose);

    // awaiting connection after assigning to the `conn` variable
    // to avoid multiple function calls creating new connections
    await conn;
  }

  return conn;
};
