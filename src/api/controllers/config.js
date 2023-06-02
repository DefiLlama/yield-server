const validator = require('validator');
const minify = require('pg-minify');

const AppError = require('../../utils/appError');
const { conn } = require('../db');
const { customHeader } = require('../../utils/lambda');

// get pool urls
const getUrl = async (req, res) => {
  const query = minify(
    `
    SELECT
        config_id,
        url
    FROM
        config
    `,
    { compress: true }
  );

  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  const out = {};
  for (const e of response) {
    out[e.config_id] = e.url;
  }
  res
    .set(customHeader(24 * 3600))
    .status(200)
    .json(out);
};

// get unique pool values
// (used during adapter testing to check if a pool field is already in the DB)
const getDistinctID = async (req, res) => {
  const query = minify(
    `
    SELECT
        DISTINCT(pool),
        config_id,
        project
    FROM
        config
    `,
    { compress: true }
  );

  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.set(customHeader(3600)).status(200).json(response);
};

// get config data of pool
const getConfigPool = async (req, res) => {
  console.log(req.params);
  const configID = req.params.configID;
  const ids = configID.split(',');
  const valid =
    ids.map((id) => validator.isUUID(id)).reduce((a, b) => a + b, 0) ===
    ids.length;
  if (!valid) return { status: 'invalid uuid parameter' };

  const query = minify(
    `
    SELECT
      *
    FROM
        config
    WHERE
        config_id IN ($<configIDs:csv>)
    `,
    { compress: true }
  );

  const response = await conn.query(query, { configIDs: ids });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res
    .set(customHeader(24 * 3600))
    .status(200)
    .json({
      status: 'success',
      data: response,
    });
};

module.exports = {
  getUrl,
  getDistinctID,
  getConfigPool,
};
