const { pgp, connect } = require('../utils/dbConnection');

const tableName = 'config';

const getDistinctProjects = async () => {
  const conn = await connect();

  const query = `SELECT distinct project FROM $<table:name>`;

  const response = await conn.query(query, { table: tableName });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response.map((i) => i.project);
};

// get config data per project
const getConfigProject = async (project) => {
  const conn = await connect();

  const query = `
    SELECT
        config_id,
        pool
    FROM
        $<table:name>
    WHERE
        project = $<project>
    `;

  const response = await conn.query(query, { table: tableName, project });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return response;
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
  getDistinctProjects,
  tableName,
};
