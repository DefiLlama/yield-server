const minify = require('pg-minify');
const { pgp, connect } = require('../utils/dbConnectionPostgres');

const tableName = 'url';

const getUrl = async () => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        project,
        link
    FROM
        url
    `,
    { compress: true }
  );

  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  const out = {};
  for (const e of response) {
    out[e.project] = e.link;
  }
  return out;
};

const insertUrl = async (payload) => {
  const conn = await connect();

  const columns = ['project', 'link'];
  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });

  // multi row insert/update
  const query =
    pgp.helpers.insert(payload, cs) +
    ' ON CONFLICT(project) DO UPDATE SET ' +
    cs.assignColumns({ from: 'EXCLUDED', skip: 'project' });

  const response = await conn.result(query);

  if (!response) {
    return new AppError(`Couldn't insert/update ${tableName} data`, 404);
  }

  return response;
};

module.exports = {
  getUrl,
  insertUrl,
};
