const S3 = require('aws-sdk/clients/s3');

const AppError = require('../utils/appError');
const { lambdaResponse } = require('../utils/lambda');
const { getDataUsingS3Select } = require('./getPoolsEnriched');

// returns enriched pool data
module.exports.handler = async (event) => {
  const response = await buildPoolsEnrichedOld(event.queryStringParameters);

  if (!response) {
    return new AppError("Couldn't retrieve data", 404);
  }

  return redirectResponse(response);
};

const buildPoolsEnrichedOld = async (queryString) => {
  const columns = [
    'chain',
    'project',
    'symbol',
    'tvlUsd',
    'apyBase',
    'apyReward',
    'apy',
    'rewardTokens',
    'pool',
    'pool_old', // old pool field
    'apyPct1D',
    'apyPct7D',
    'apyPct30D',
    'stablecoin',
    'ilRisk',
    'exposure',
    'predictions',
    'poolMeta',
    'mu',
    'sigma',
    'count',
    'outlier',
    'underlyingTokens',
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

  const data = await getDataUsingS3Select(params);

  return data;
};

// the above is not cached like we do for /pools. api response is >6mb so we won't be able to
// return the data from the lambda directly. applying redirect as in defillama-server
// (see: https://github.com/DefiLlama/defillama-server/blob/master/defi/src/getProtocol.ts#L50)
const datasetBucket = 'defillama-datasets';
export async function redirectResponse(response) {
  const jsonData = JSON.stringify(response);
  const filename = 'yields-poolsOld.json';
  await storeDataset(filename, jsonData, 'application/json');
  return buildRedirect(filename);
}

function next21Minutedate() {
  const dt = new Date();
  dt.setHours(dt.getHours() + 1);
  dt.setMinutes(21);
  return dt;
}

export async function storeDataset(filename, body, contentType = 'text/csv') {
  await new S3()
    .upload({
      Bucket: datasetBucket,
      Key: `temp/${filename}`,
      Body: body,
      ACL: 'public-read',
      ContentType: contentType,
    })
    .promise();
}

export function buildRedirect(filename, cache) {
  return {
    statusCode: 307,
    body: '',
    headers: {
      Location: `https://defillama-datasets.s3.eu-central-1.amazonaws.com/temp/${filename}`,
      ...(cache !== undefined
        ? {
            'Cache-Control': `max-age=${cache}`,
          }
        : {}),
      Expires: next21Minutedate(),
    },
  };
}
