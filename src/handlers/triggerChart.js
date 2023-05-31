const S3 = require('aws-sdk/clients/s3');

const { connect } = require('../utils/dbConnection');
const utils = require('../utils/s3');
const { yieldHistoryQuery } = require('../controllers/yieldController');

module.exports.handler = async () => {
  await main();
};

const main = async () => {
  const pools = await utils.readFromS3(
    'llama-apy-prod-data',
    'enriched/dataEnriched.json'
  );

  // testing
  const configIds = pools.map((p) => p.pool).slice(0, 5);
  const conn = await connect();
  const chartData = await Promise.allSettled(
    configIds.map((cid) =>
      conn.query(yieldHistoryQuery, { configIDValue: cid, table: 'yield' })
    )
  );
  const data = chartData
    .map((p, i) => ({ ...p, pool: configIds[i] }))
    .filter((i) => i.status === 'fulfilled');

  await Promise.all(
    data.map((p) =>
      utils.storeAPIResponse('defillama-datasets', `yield-api/${p.pool}`, {
        status: 'success',
        data: p.value,
      })
    )
  );
};
