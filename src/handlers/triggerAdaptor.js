const superagent = require('superagent');
const SSM = require('aws-sdk/clients/ssm');

const writeToS3 = require('../utils/writeToS3');

module.exports.handler = async (event) => {
  console.log(event);

  // We return failed msg ids,
  // so that only failed messages will be retried by SQS in case of min of 1 error in batch
  // https://www.serverless.com/blog/improved-sqs-batch-error-handling-with-aws-lambda
  const failedMessageIds = [];

  for (const record of event.Records) {
    try {
      const body = JSON.parse(record.body);
      await main(body);
    } catch (err) {
      console.log(err);
      failedMessageIds.push(record.messageId);
    }
  }
  return {
    batchItemFailures: failedMessageIds.map((id) => {
      return {
        itemIdentifier: id,
      };
    }),
  };
};

// func for running adaptor, storing result to db (filtered) and s3 (unfiltered)
const main = async (body) => {
  // run adaptor
  console.log(body.adaptor);
  const project = require(`../adaptors/${body.adaptor}/index.js`);
  let data = await project.apy();

  // add the timestamp field
  // will be rounded to the nearest hour
  // eg 2022-04-06T10:00:00.000Z
  const timestamp = new Date(
    Math.floor(Date.now() / 1000 / 60 / 60) * 60 * 60 * 1000
  );
  for (const d of data) {
    d['timestamp'] = timestamp;
  }

  // filter to $1k usd tvl
  const tvlMinThr = 1e3;
  dataDB = data.filter((el) => el.tvlUsd >= tvlMinThr);
  console.log('saving data to DB');

  // get cached access token
  const ssm = new SSM();
  const options = {
    Name: `${process.env.SSM_PATH}/bearertoken`,
    WithDecryption: true,
  };
  const token = await ssm.getParameter(options).promise();
  // save to db
  const response = await superagent
    .post(`${process.env.APIG_URL}/pools`)
    .send(dataDB)
    .set({ Authorization: `Bearer ${token.Parameter.Value}` });
  console.log(response.body);

  // save unfiltered backup to s3
  console.log('saving data to S3');
  const d = new Date();
  const dd = d.toISOString().split('T');
  const bucket = process.env.BUCKET_DATA;
  const key = `base/${dd[0]}/${d.getHours()}/${dd[1]}_${body.adaptor}.json`;

  await writeToS3(bucket, key, data);
};
