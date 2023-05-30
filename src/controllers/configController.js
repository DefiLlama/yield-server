const minify = require('pg-minify');
const validator = require('validator');

const { pgp, conn } = require('../utils/dbConnection');
const customHeader = require('../utils/customHeader');

const tableName = 'config';

const getDistinctProjects = async () => {
  const query = `SELECT distinct project FROM $<table:name>`;

  const response = await conn.query(query, { table: tableName });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response.map((i) => i.project);
};

// get config data per project
const getConfigProject = async (project) => {
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
const getUrl = async (req, res) => {
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
  res.set(customHeader()).status(200).json(out);
};

// get unique pool values
// (used during adapter testing to check if a pool field is already in the DB)
const getDistinctID = async () => {
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
const getConfigPool = async (req, res) => {
  const configIDs = req.params.configIDs;
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

  res.set(customHeader()).status(200).json({
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
  getDistinctProjects,
  tableName,
};
