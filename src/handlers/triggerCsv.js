const AWS = require('aws-sdk');
const createCsvStringifier = require('csv-writer').createObjectCsvStringifier;

const utils = require('../utils/s3');

module.exports.handler = async () => {
  await main();
};

const main = async () => {
  let poolsEnriched = (
    await utils.readFromS3('defillama-datasets', 'yield-api/pools')
  ).data;

  // parse nested prediction field into separate fields
  poolsEnriched = poolsEnriched.map((p) => ({
    ...p,
    predictedClass: p['predictions']['predictedClass'],
    predictedConfidence: p['predictions']['predictedProbability'],
    binnedConfidence: p['predictions']['binnedConfidence'],
  }));

  // remove predictions field
  poolsEnriched = poolsEnriched.map(({ predictions, ...item }) => item);

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
