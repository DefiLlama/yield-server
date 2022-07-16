const { insertPools } = require('../api/controllers');
const { boundaries } = require('../utils/exclude');

module.exports.handler = async (event, context) => {
  context.callbackWaitsForEmptyEventLoop = false;
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

  // remove potential null/undefined in array
  data = data.filter((p) => p);

  // nullify potential NaN/undefined apy values
  data = data.map((p) => ({ ...p, apy: isNaN(p.apy) ? null : p.apy }));

  // add the timestamp field
  // will be rounded to the nearest hour
  // eg 2022-04-06T10:00:00.000Z
  const timestamp = new Date(
    Math.floor(Date.now() / 1000 / 60 / 60) * 60 * 60 * 1000
  );
  data = data
    .map((p) => ({ ...p, timestamp: timestamp }))
    // remove everything below LB ($1k)
    .filter((el) => el.tvlUsd >= boundaries.tvlUsdDB.lb);

  console.log('saving data to DB');
  const response = await insertPools(data);
  console.log(response);
};
