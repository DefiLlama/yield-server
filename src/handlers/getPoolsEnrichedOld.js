const S3 = require('aws-sdk/clients/s3');

const AppError = require('../utils/appError');
const { lambdaResponse } = require('../utils/lambda');
const { getDataUsingS3Select } = require('./getPoolsEnriched');
const { storeAPIResponse, next21Minutedate } = require('../utils/s3');

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

// /poolsOld runs lambda -> stores data to s3 (temp folder) and redirects so it reads from there
// instead of returning from lambda (which breaks the 6mb limit as we are already above that)
// applying redirect as in defillama-server
// (see: https://github.com/DefiLlama/defillama-server/blob/master/defi/src/getProtocol.ts#L50)
const redirectResponse = async (response) => {
  const filename = 'yields-poolsOld.json';
  // store /poolsEnriched (/pools) api response to s3 where we cache it
  await storeAPIResponse('defillama-datasets', `temp/${filename}`, {
    status: 'success',
    data: response,
  });
  return buildRedirect(filename);
};

const buildRedirect = (filename) => {
  return {
    statusCode: 307,
    body: '',
    headers: {
      Location: `https://defillama-datasets.s3.eu-central-1.amazonaws.com/temp/${filename}`,
      Expires: next21Minutedate()
    },
  };
};
