const SQS = require('aws-sdk/clients/sqs');

const { excludeAdaptors } = require('../utils/exclude');
const adaptorList = require('../adaptors/list');

module.exports.handler = async () => {
  await main();
};

// starting pipeline
// sends 1 msg for each adaptor to adaptorqueue
// from which the adaptor lambda polls of messages
const main = async () => {
  console.log(`START ADAPTER-PIPELINE`);

  try {
    const sqs = new SQS();
    const adaptors = adaptorList.filter(
      (a) => !excludeAdaptors.includes(a)
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
