const AWS = require('aws-sdk');
const superagent = require('superagent');
const createCsvStringifier = require('csv-writer').createObjectCsvStringifier;

module.exports.handler = async (event) => {
  await main();
};

const main = async () => {
  let poolsEnriched = await superagent.get(
    'https://1rwmj4tky9.execute-api.eu-central-1.amazonaws.com/poolsEnriched'
  );
  poolsEnriched = poolsEnriched.body.data;

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
