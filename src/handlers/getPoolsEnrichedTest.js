const S3 = require('aws-sdk/clients/s3');

const AppError = require('../utils/appError');
const { lambdaResponse } = require('../utils/lambda');

const { getDataUsingS3Select } = require('./getPoolsEnriched');

// returns enriched pool data
module.exports.handler = async (event) => {
  console.log(event.queryStringParameters);
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
  let columns = [
    'chain',
    'project',
    'symbol',
    'tvlUsd',
    'apyBase',
    'apyReward',
    'apy',
    'rewardTokens',
    'pool',
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
    'il7d',
    'apyBase7d',
    'apyMean30d',
    'volumeUsd1d',
    'volumeUsd7d',
    'apyBaseInception',
  ];
  columns = queryString !== undefined ? [...columns, 'url'] : columns;
  columns = columns.map((el) => `t."${el}"`).join(', ');

  let query = `SELECT ${columns} FROM s3object[*][*] t`;

  if (queryString !== undefined) {
    query = `${query} where t."${Object.keys(queryString)[0]}"='${
      Object.values(queryString)[0]
    }'`;
  }

  console.log(query);

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
