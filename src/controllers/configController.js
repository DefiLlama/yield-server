const minify = require('pg-minify');

const { pgp, connect } = require('../utils/dbConnection');
const { lambdaResponse } = require('../utils/lambda');

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

// get pool urls
const getUrl = async () => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        config_id,
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
    out[e.config_id] = e.url;
  }

  return out;
};

// get unique pool values
// (used during adapter testing to check if a pool field is already in the DB)
const getDistinctID = async () => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
        DISTINCT(pool),
        config_id,
        project
    FROM
        $<table:name>
    `,
    { compress: true }
  );

  const response = await conn.query(query, { table: tableName });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
};

// get config data of pool
const getConfigPool = async (configIDs) => {
  const conn = await connect();

  const query = minify(
    `
    SELECT
      *
    FROM
        $<table:name>
    WHERE
        config_id IN ($<configIDs:csv>)
    `,
    { compress: true }
  );

  const response = await conn.query(query, {
    table: tableName,
    configIDs: configIDs.split(','),
  });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return lambdaResponse({
    status: 'success',
    data: response,
  });
};

// multi row insert (update on conflict) query generator
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
    { name: 'ltv', def: null },
    { name: 'borrowable', def: null },
    { name: 'mintedCoin', def: null },
    { name: 'borrowFactor', def: null },
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });
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
  getDistinctID,
  getConfigPool,
  tableName,
};
