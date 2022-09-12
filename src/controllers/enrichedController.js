const minify = require('pg-minify');

const { pgp, connect } = require('../utils/dbConnection');
const {
  tableName: configTableName,
} = require('../controllers/configController');
const {
  readFromS3,
  storeAPIResponse,
  next21Minutedate,
} = require('../utils/s3');
const AppError = require('../utils/appError');

const tableName = 'enriched';

// get enriched + config table fields for a specific pool (required by frontend /pool page)
// to display chain, symbol, outlook details etc...
const getPool = async (configID) => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        *
    FROM
        $<enrichedTable:name> AS e
        INNER JOIN $<configTable:name> AS c ON e."configID" = c.config_id
    WHERE
        "configID" = $<configIDValue>
    `,
    { compress: true }
  );

  const response = await conn.query(query, {
    configIDValue: configID,
    enrichedTable: tableName,
    configTable: configTableName,
  });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return lambdaResponse({
    status: 'success',
    data: response,
  });
};

// multi row insert (update on conflict)
const insertEnriched = async (payload) => {
  const conn = await connect();

  const columns = [
    // all fields are created for each pool by triggerEnrichment lambda
    'configID',
    'apyPct1D',
    'apyPct7D',
    'apyPct30D',
    'stablecoin',
    'ilRisk',
    'exposure',
    'mu',
    'sigma',
    'outlier',
    'predictedClass',
    'predictedProbability',
    'binnedConfidence',
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });

  const query =
    pgp.helpers.insert(payload, cs) +
    ' ON CONFLICT("configID") DO UPDATE SET ' +
    cs.assignColumns({ from: 'EXCLUDED', skip: 'configID' });

  const response = await conn.result(query);

  if (!response) {
    return new AppError(`Couldn't insert/update ${tableName} data`, 404);
  }

  return response;
};

// get enriched dataset (output from triggerEnrichment) which
// includes `pool_old` (our adapter pool values); used only i
const getPoolsOld = async () => {
  const response = await readFromS3(
    'llama-apy-prod-data',
    'enriched/dataEnriched.json'
  );

  if (!response) {
    return new AppError("Couldn't retrieve data", 404);
  }

  return redirectResponse(response);
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
      Expires: next21Minutedate(),
      'Access-Control-Allow-Origin': '*',
    },
  };
};

module.exports = {
  getPool,
  getPoolsOld,
  insertEnriched,
};
