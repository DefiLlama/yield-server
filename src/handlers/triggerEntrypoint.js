const SQS = require('aws-sdk/clients/sqs');
const adaptorsToExclude = require('../utils/exclude');

module.exports.handler = async (event) => {
  await main();
};

// starting pipeline
// sends 1 msg for each adaptor to adaptorqueue
// from which the adaptor lambda polls of messages
const main = async () => {
  console.log(`START ADAPTER-PIPELINE at ${new Date()}`);

  try {
    const sqs = new SQS();
    const adaptors = JSON.parse(process.env.ADAPTORS).filter(
      (a) => !adaptorsToExclude.includes(a)
    );

    for (const adaptor of adaptors) {
      await sqs
        .sendMessage({
          QueueUrl: process.env.ADAPTER_QUEUE_URL,
          MessageBody: JSON.stringify({
            adaptor,
          }),
        })
        .promise();
    }
    return JSON.stringify({
      body: 'pipeline started',
    });
  } catch (err) {
    console.log(err);
  }
};
