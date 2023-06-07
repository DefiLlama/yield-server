const fs = require('fs');

const superagent = require('superagent');

const { confirm } = require('./confirm');
const { connect } = require('../src/utils/dbConnection');
const {
  buildInsertConfigQuery,
} = require('../src/controllers/configController');

(async () => {
  await confirm(
    `Confirm with 'yes' if you want to start the ${process.argv[1]
      .split('/')
      .slice(-1)} script: `
  );

  const uuids = JSON.parse(fs.readFileSync('./created_uuids.json'));
  const urls = (await superagent.get('https://yields.llama.fi/url')).body;
  let data = JSON.parse(fs.readFileSync('./yield_snapshot_last.json'));

  data = data.map((p) => ({
    config_id: uuids[p.pool],
    pool: p.pool,
    project: p.project,
    chain: p.chain,
    symbol: p.symbol,
    poolMeta: p.poolMeta,
    underlyingTokens:
      p?.underlyingTokens?.length > 0 ? p?.underlyingTokens : null,
    rewardTokens: p?.rewardTokens?.length > 0 ? p?.rewardTokens : null,
    url: urls[p.project],
  }));

  // build multi row insert query
  const insertConfigQ = buildInsertConfigQuery(data);

  const conn = await connect();
  const response = await conn.result(insertConfigQ);
  console.log(response);
  process.exit(0);
})();
