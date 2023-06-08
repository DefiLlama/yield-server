const AWS = require('aws-sdk');
AWS.config.update({
  accessKeyId: process.env.aws_access_key_id,
  secretAccessKey: process.env.aws_secret_access_key,
  region: process.env.region,
});
const S3 = require('aws-sdk/clients/s3');
const validator = require('validator');

const AppError = require('../../utils/appError');
const { customHeader } = require('../../utils/lambda');
const poolsEnrichedColumns = require('../../utils/enrichedColumns');

const readWithS3Select = async (params) => {
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

const getPoolEnriched = async (req, res) => {
  // querystring (though we only use it for pool values on /pool pages)
  // note: change to route param later -> /pools/:pool
  const configID = req.query.pool;
  if (!configID || !validator.isUUID(configID))
    return res.status(400).json('invalid configID!');

  const queryString = req.query;

  let columns = poolsEnrichedColumns;
  columns = queryString !== undefined ? [...columns, 'url'] : columns;
  columns = columns.map((el) => `t."${el}"`).join(', ');

  let query = `SELECT ${columns} FROM s3object[*][*] t`;

  if (queryString !== undefined) {
    query = `${query} where t."${Object.keys(queryString)[0]}"='${
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

  const response = await readWithS3Select(params);

  if (!response) {
    return new AppError("Couldn't retrieve data", 404);
  }

  res.set(customHeader(3600)).status(200).json({
    status: 'success',
    data: response,
  });
};

module.exports = { getPoolEnriched, readWithS3Select };
