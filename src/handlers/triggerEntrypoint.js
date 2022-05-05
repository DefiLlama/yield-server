const SQS = require('aws-sdk/clients/sqs');

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
    for (const adaptor of JSON.parse(process.env.ADAPTORS)) {
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
