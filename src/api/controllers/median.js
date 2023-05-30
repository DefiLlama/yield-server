const minify = require('pg-minify');

const { conn } = require('../../utils/dbConnection');

const getMedian = async () => {
  const query = minify(
    `
    SELECT
        timestamp,
        "uniquePools",
        "medianAPY"
    FROM
        median
    ORDER BY
        timestamp ASC
    `,
    { compress: true }
  );

  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  return response;
};

module.exports = { getMedian };
