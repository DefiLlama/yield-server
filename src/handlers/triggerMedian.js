const ss = require('simple-statistics');

const { insertMedian } = require('../queries/median');
const utils = require('../utils/s3');

module.exports.handler = async () => {
  await main();
};

const main = async () => {
  let pools = (
    await utils.readFromS3('llama-apy-prod-data', 'enriched/dataEnriched.json')
  ).map((i) => ({ ...i, timestamp: new Date(i.timestamp) }));

  // include only pools which we have updated on that day,
  // otherwise median calc for that day would include values from yst up to 7days ago
  console.log('removing stale pools...');
  console.log('prior filter', pools.length);
  const maxTimestamp = Math.max(...pools.map((p) => p.timestamp));
  const n = 1000 * 60 * 60 * 24;
  const latestDay = new Date(Math.floor(maxTimestamp / n) * n);
  pools = pools.filter((p) => p.timestamp >= latestDay);
  console.log('after filter', pools.length);

  const payload = [
    {
      timestamp: new Date(),
      medianAPY: +ss.median(pools.map((p) => p.apy)).toFixed(5),
      uniquePools: new Set(pools.map((p) => p.pool)).size,
    },
  ];
  const response = await insertMedian(payload);
  console.log(response);
};
