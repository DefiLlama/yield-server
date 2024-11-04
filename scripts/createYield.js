const fs = require('fs');

const { confirm } = require('./confirm');
const { connect } = require('../src/utils/dbConnection');
const { buildInsertYieldQuery } = require('../src/queries/yield');

(async () => {
  await confirm(
    `Confirm with 'yes' if you want to start the ${process.argv[1]
      .split('/')
      .slice(-1)} script: `
  );

  const uuids = JSON.parse(fs.readFileSync('./created_uuids.json'));

  let data = JSON.parse(fs.readFileSync('./yield_snapshot_daily.json'));

  data = data.map((p) => ({
    configID: uuids[p.pool],
    timestamp: new Date(p.timestamp),
    tvlUsd: p.tvlUsd,
    apy: p.apy,
    apyBase: p.apyBase,
    apyReward: p.apyReward,
  }));

  // build multi row insert query
  const insertYieldQ = buildInsertYieldQuery(data);

  const conn = await connect();
  const response = await conn.result(insertYieldQ);
  console.log(response);
  process.exit(0);
})();
