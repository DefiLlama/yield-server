const fs = require('fs');

const { confirm } = require('./confirm');
const { pgp, connect } = require('../src/utils/dbConnection');
const { tableName: configTableName } = require('../src/queries/config');

(async () => {
  await confirm(
    `Confirm with 'yes' if you want to start the ${process.argv[1]
      .split('/')
      .slice(-1)} script: `
  );

  const payload = JSON.parse(fs.readFileSync('./old_new_mapping.json'));
  const X = payload.map((p) => ({ poolOld: p.pool, pool: p.poolNew }));

  // ? -> only used in where clause
  const cs = new pgp.helpers.ColumnSet(['?poolOld', 'pool'], {
    table: configTableName,
  });
  const query = pgp.helpers.update(X, cs) + ' WHERE v."poolOld" = t.pool';

  const conn = await connect();
  const response = await conn.result(query);

  console.log(response);
  process.exit(0);
})();
