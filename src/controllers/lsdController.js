const minify = require('pg-minify');

const { pgp, connect } = require('../utils/dbConnection');

const getLsd = async () => {
  const conn = await connect();

  const query = minify(
    `
SELECT
    DISTINCT ON (address) *
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

  return response;
};

const insertLsd = async (payload) => {
  const conn = await connect();

  const columns = [
    'timestamp',
    'name',
    'symbol',
    'address',
    { name: 'type', def: null },
    { name: 'expectedRate', def: null },
    { name: 'marketRate', def: null },
    { name: 'ethPeg', def: null },
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: 'lsd' });
  const query = pgp.helpers.insert(payload, cs);
  const response = await conn.result(query);

  if (!response) {
    return new AppError(`Couldn't insert/update data`, 404);
  }

  return response;
};

module.exports = {
  getLsd,
  insertLsd,
};
