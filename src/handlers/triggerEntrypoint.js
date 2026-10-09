const SQS = require('aws-sdk/clients/sqs');

const { getExcludedAdaptors } = require('../utils/exclude');
const adaptorList = require('../adaptors/list');

const BATCH_SIZE = 10;
const MAX_BATCH_ATTEMPTS = 2;

module.exports.handler = async () => {
  await main();
};

const main = async () => {
  console.log(`START ADAPTER-PIPELINE`);

  try {
    const sqs = new SQS();
    const excludedAdaptors = await getExcludedAdaptors();
    const adaptors = adaptorList.filter((a) => !excludedAdaptors.has(a));
    const failedEntries = [];

    for (let i = 0; i < adaptors.length; i += BATCH_SIZE) {
      const batch = adaptors.slice(i, i + BATCH_SIZE);

      try {
        failedEntries.push(...(await sendBatch(sqs, batch)));
      } catch (err) {
        failedEntries.push(
          ...batch.map((adaptor) => ({
            adaptor,
            code: err.code,
            message: err.message,
          }))
        );
      }
    }

    if (failedEntries.length) {
      console.log(
        `failed to queue ${failedEntries.length} adapters`,
        failedEntries
      );
    }

    return JSON.stringify({
      body: 'pipeline started',
    });
  } catch (err) {
    console.log(err);
  }
};

const sendBatch = async (sqs, adaptors) => {
  let entries = adaptors.map((adaptor, index) => ({
    Id: index.toString(),
    MessageBody: JSON.stringify({ adaptor }),
  }));
  const failedEntries = [];

  for (let attempt = 0; attempt < MAX_BATCH_ATTEMPTS; attempt++) {
    let response;

    try {
      response = await sqs
        .sendMessageBatch({
          QueueUrl: process.env.ADAPTER_QUEUE_URL,
          Entries: entries,
        })
        .promise();
    } catch (err) {
      return [
        ...failedEntries,
        ...entries.map((entry) => ({
          adaptor: adaptors[Number(entry.Id)],
          code: err.code,
          message: err.message,
        })),
      ];
    }

    const failures = new Map(
      (response.Failed || []).map((failure) => [failure.Id, failure])
    );
    const retryableEntries = [];

    for (const entry of entries) {
      const failure = failures.get(entry.Id);
      if (!failure) continue;

      if (!failure.SenderFault && attempt + 1 < MAX_BATCH_ATTEMPTS) {
        retryableEntries.push(entry);
      } else {
        failedEntries.push({
          adaptor: adaptors[Number(entry.Id)],
          code: failure.Code,
          message: failure.Message,
        });
      }
    }

    if (!retryableEntries.length) break;
    entries = retryableEntries;
  }

  return failedEntries;
};
