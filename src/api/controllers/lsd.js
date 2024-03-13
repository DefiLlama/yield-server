const validator = require('validator');
const minify = require('pg-minify');

const AppError = require('../../utils/appError');
const { conn } = require('../db');

const getLsd = async (req, res) => {
  const query = `
  SELECT
    DISTINCT ON (address)
    name,
    symbol,
    address,
    type,
    "expectedRate",
    "marketRate",
    "ethPeg",
    fee
  FROM
    lsd
  ORDER BY
    address,
    timestamp DESC
      `;
  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.status(200).json(response);
};

module.exports = { getLsd };
