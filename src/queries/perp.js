const minify = require('pg-minify');

const AppError = require('../utils/appError');
const { pgp, connect } = require('../utils/dbConnection');

const tableName = 'perpetual';

// multi row
const insertPerp = async (payload) => {
  const conn = await connect();

  const columns = [
    'timestamp',
    'marketplace',
    'market',
    'baseAsset',
    'fundingRate',
    'fundingRatePrevious',
    'fundingTimePrevious',
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
  insertPerp,
};
