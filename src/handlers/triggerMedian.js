const ss = require('simple-statistics');

const { getYield } = require('../controllers/yieldController');
const { insertMedian } = require('../controllers/medianController');

module.exports.handler = async () => {
  await main();
};

const main = async () => {
  // get latest pools. we filter those to the subset which we have updated on that day
  // otherwise median calc for that day would include values from yst up to 7days ago
  let pools = await getYield();

  console.log('removing stale pools...');
  console.log('prior filter', pools.length);
  const maxTimestamp = Math.max(...pools.map((p) => p.timestamp));
  const n = 1000 * 60 * 60 * 24;
  const latestDay = new Date(Math.floor(maxTimestamp / n) * n);
  pools = pools.filter((p) => p.timestamp >= latestDay);
  console.log('after filter', pools.length);

  const payload = [
    {
      timestamp: new Date(
        Math.floor(Date.now() / 1000 / 60 / 60) * 60 * 60 * 1000
      ),
      medianAPY: ss.median(pools.map((p) => p.apy)),
      uniquePools: new Set(pools.map((p) => p.pool)).size,
    },
  ];
  const response = await insertMedian(payload);
  console.log(response);
};
