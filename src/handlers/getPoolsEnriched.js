const S3 = require('aws-sdk/clients/s3');

const AppError = require('../utils/appError');
const { lambdaResponse } = require('../utils/lambda');

// returns enriched pool data
module.exports.handler = async (event, context, callback) => {
  const response = await buildPoolsEnriched(event.queryStringParameters);

  if (!response) {
    return new AppError("Couldn't retrieve data", 404);
  }

  return lambdaResponse({
    status: 'success',
    data: response,
  });
};

const buildPoolsEnriched = async (queryString) => {
  const columns = [
    'chain',
    'project',
    'symbol',
    'tvlUsd',
    'apy',
    'pool',
    'apyPct1D',
    'apyPct7D',
    'apyPct30D',
    'projectName',
    'stablecoin',
    'ilRisk',
    'exposure',
    'predictions',
    'audits',
    'audit_links',
    'url',
    'twitter',
    'category',
    'market',
    'mu',
    'sigma',
    'count',
    'outlier',
  ]
    .map((el) => `t."${el}"`)
    .join(', ');

  let query = `SELECT ${columns} FROM s3object[*][*] t`;

  if (queryString !== undefined) {
    query = `${query} where t.${Object.keys(queryString)[0]}='${
      Object.values(queryString)[0]
    }'`;
  }

  const params = {
    Bucket: 'llama-apy-prod-data',
    Key: 'enriched/dataEnriched.json',
    ExpressionType: 'SQL',
    Expression: query,
    InputSerialization: {
      JSON: {
        Type: 'DOCUMENT',
      },
    },
    OutputSerialization: {
      JSON: {
        RecordDelimiter: ',',
      },
    },
  };

  let data = await getDataUsingS3Select(params);
  // rook requires an adaptor change, we going to remove it from the enriched
  // dataset for now
  data = data.filter((el) => el.project !== 'rook');

  return data;
};
module.exports.buildPoolsEnriched = buildPoolsEnriched;

const getDataUsingS3Select = async (params) => {
  const s3 = new S3();

  return new Promise((resolve, reject) => {
    s3.selectObjectContent(params, (err, data) => {
      if (err) {
        reject(err);
      }

      if (!data) {
        reject('Empty data object');
      }

      // This will be an array of bytes of data, to be converted
      // to a buffer
      const records = [];

      // This is a stream of events
      data.Payload.on('data', (event) => {
        // There are multiple events in the eventStream, but all we
        // care about are Records events. If the event is a Records
        // event, there is data inside it
        if (event.Records) {
          records.push(event.Records.Payload);
        }
      })
        .on('error', (err) => {
          reject(err);
        })
        .on('end', () => {
          // Convert the array of bytes into a buffer, and then
          // convert that to a string
          let X = Buffer.concat(records).toString('utf8');

          // remove any trailing commas
          X = X.replace(/\,$/, '');

          // Add into JSON 'array'
          X = `[${X}]`;

          try {
            const out = JSON.parse(X);
            resolve(out);
          } catch (e) {
            reject(
              new Error(
                `Unable to convert S3 data to JSON object. S3 Select Query: ${params.Expression}`
              )
            );
          }
        });
    });
  });
};
