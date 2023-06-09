const validator = require('validator');
const minify = require('pg-minify');

const AppError = require('../../utils/appError');
const { conn } = require('../db');
const { customHeader } = require('../../utils/headers');

const getLsd = async (req, res) => {
  const query = minify(
    `
  SELECT
    DISTINCT ON (address)
    name,
    symbol,
    address,
    type,
    "expectedRate",
    "marketRate",
    "ethPeg"
  FROM
    lsd
  ORDER BY
    address,
    timestamp DESC
      `,
    { compress: true }
  );

  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.set(customHeader(3600)).status(200).json(response);
};

module.exports = { getLsd };
