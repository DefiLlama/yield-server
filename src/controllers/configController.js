const minify = require('pg-minify');

const { pgp, connect } = require('../utils/dbConnection');

const tableName = 'config';

// get config data per project
const getConfigProject = async (project) => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        config_id,
        pool
    FROM
        $<table:name>
    WHERE
        project = $<project>
    `,
    { compress: true }
  );

  const response = await conn.query(query, { table: tableName, project });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
};

// get distinct urls per project
const getUrl = async () => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        DISTINCT(project),
        url
    FROM
        $<table:name>
    `,
    { compress: true }
  );

  const response = await conn.query(query, { table: tableName });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  const out = {};
  for (const e of response) {
    out[e.project] = e.url;
  }

  return out;
};

const getUniquePool = async () => {
  const conn = await connect();

  const response = await conn.query(
    'SELECT DISTINCT(pool) from $<table:name>',
    { table: tableName }
  );

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
};

// return the insertConfig query which we use inside a transaction in adapter handler
const buildInsertConfigQuery = (payload) => {
  const columns = [
    'config_id',
    'pool',
    'project',
    'chain',
    'symbol',
    // pg-promise is not aware of the db-schema -> we need to make sure that
    // optional fields are marked and provided with a default value
    // otherwise the `result` method will fail
    { name: 'poolMeta', def: null },
    { name: 'underlyingTokens', def: null },
    { name: 'rewardTokens', def: null },
    'url',
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });

  // multi row insert/update
  const query =
    pgp.helpers.insert(payload, cs) +
    ' ON CONFLICT(config_id) DO UPDATE SET ' +
    cs.assignColumns({ from: 'EXCLUDED', skip: 'config_id' });

  return query;
};

module.exports = {
  getConfigProject,
  buildInsertConfigQuery,
  getUrl,
  getUniquePool,
};
