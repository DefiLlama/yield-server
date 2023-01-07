const minify = require('pg-minify');

const AppError = require('../utils/appError');
const { pgp, connect } = require('../utils/dbConnection');
const { lambdaResponse } = require('../utils/lambda');

const tableName = 'perpetual';

// get latest data for each unique perp
const getPerp = async () => {
  const conn = await connect();
  const query = minify(
    `
    SELECT
        DISTINCT ON ("marketPlace", market) *
    FROM
        $<perpTable:name>
    ORDER BY
        "marketPlace", 
        "market",
        timestamp DESC   
  `,
    { compress: true }
  );

  const response = await conn.query(query, {
    perpTable: tableName,
  });

  if (!response) {
    return new AppError(`Couldn't get ${tableName} data`, 404);
  }

  return lambdaResponse({
    status: 'success',
    data: response,
  });
};

// multi row
const insertPerp = async (payload) => {
  const conn = await connect();

  const columns = [
    'timestamp',
    'marketPlace',
    'market',
    'baseAsset',
    'fundingRate',
    'openInterest',
    'indexPrice',
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: tableName });
  const query = pgp.helpers.insert(payload, cs);

  const response = await conn.result(query);

  if (!response) {
    return new AppError(`Couldn't insert ${tableName} data`, 404);
  }

  return response;
};

module.exports = {
  getPerp,
  insertPerp,
};
