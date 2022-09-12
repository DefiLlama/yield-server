const AWS = require('aws-sdk');
const createCsvStringifier = require('csv-writer').createObjectCsvStringifier;

const { readFromS3 } = require('../utils/s3');

module.exports.handler = async () => {
  await main();
};

const main = async () => {
  let poolsEnriched = await readFromS3(
    process.env.BUCKET_DATA,
    'enriched/dataEnriched.json'
  );

  // parse nested prediction field into separate fields
  poolsEnriched = poolsEnriched.map((p) => ({
    ...p,
    predictedClass: p['predictions']['predictedClass'],
    predictedConfidence: p['predictions']['predictedProbability'],
    binnedConfidence: p['predictions']['binnedConfidence'],
  }));

  // remove fields
  poolsEnriched = poolsEnriched.map(
    ({ predictions, pool_old, ...item }) => item
  );

  const csvStringifier = createCsvStringifier({
    header: Object.keys(poolsEnriched[0]).map((c) => ({ id: c, title: c })),
  });

  const headerString = csvStringifier.getHeaderString();
  const body = csvStringifier.stringifyRecords(poolsEnriched);
  const csv = headerString + body;

  const params = {
    Bucket: 'defillama-datasets',
    Key: 'yields/yield_rankings.csv',
    ACL: 'public-read',
    Body: csv,
    ContentType: 'text/csv',
  };

  const s3 = new AWS.S3();
  const resp = await s3.upload(params).promise();
  const msg = `saved to ${resp.Location}`;
  console.log(msg);
};
