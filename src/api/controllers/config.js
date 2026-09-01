const validator = require('validator');

const AppError = require('../../utils/appError');
const { conn } = require('../db');
const { readFromS3 } = require('../../utils/s3');

// get pool urls (filtered to only include pools that appear in /pools response)
const getUrl = async (req, res) => {
  const out = {};
  const data = await readFromS3('llama-apy-prod-data', 'enriched/dataEnriched.json');
  for (const p of data) {
    out[p.pool] = p.url;
  }
  res.status(200).json(out);
};

// get unique pool values
// (used during adapter testing to check if a pool field is already in the DB)
const getDistinctID = async (req, res) => {
  const query = `
    SELECT
        DISTINCT(pool),
        config_id,
        project
    FROM
        config
    `;
  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.status(200).json(response);
};

// get config data of pool
const getConfigPool = async (req, res) => {
  const configID = req.params.configID;
  const ids = configID.split(',');
  const valid =
    ids.map((id) => validator.isUUID(id)).reduce((a, b) => a + b, 0) ===
    ids.length;
  if (!valid) return { status: 'invalid uuid parameter' };

  const query = `
    SELECT
      *
    FROM
        config
    WHERE
        config_id IN ($<configIDs:csv>)
    `;
  const response = await conn.query(query, { configIDs: ids });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.status(200).json({
    status: 'success',
    data: response,
  });
};

// for calc liq on main protocol dashboard
const getAllPools = async (req, res) => {
  const query = `
    SELECT
        config_id,
        symbol,
        project,
        chain,
        "underlyingTokens"
    FROM
        config
    `;

  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.status(200).json(response);
};

module.exports = {
  getUrl,
  getDistinctID,
  getConfigPool,
  getAllPools,
};
