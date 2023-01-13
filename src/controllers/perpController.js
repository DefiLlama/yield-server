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
        perp_id,
        "timestamp",
        main.marketplace,
        main.market,
        "baseAsset",
        "fundingRate",
        "fundingRatePrevious",
        "fundingTimePrevious",
        "openInterest",
        "indexPrice",
        "fundingRate7dAverage"
    FROM
        (
            SELECT
                DISTINCT ON (marketplace, market) *
            FROM
                $<perpTable:name>
            WHERE
                timestamp >= NOW() - INTERVAL '$<age> HOUR'
            ORDER BY
                marketplace,
                market,
                timestamp DESC
        ) AS main
        JOIN (
            SELECT
                marketplace,
                market,
                round(avg("fundingRatePrevious"), 5) AS "fundingRate7dAverage"
            FROM
                (
                    SELECT
                        DISTINCT ON (marketplace, market, "fundingTimePrevious") *
                    FROM
                      $<perpTable:name>
                    WHERE
                        "fundingTimePrevious" IS NOT NULL
                        AND timestamp >= NOW() - INTERVAL '$<fundingRate7dAverageAge> DAY'
                    ORDER BY
                        marketplace,
                        market,
                        "fundingTimePrevious" DESC
                ) AS main
            GROUP BY
                marketplace,
                market
        ) AS avg7d ON avg7d.marketplace = main.marketplace
        AND avg7d.market = main.market
    `,
    { compress: true }
  );

  const response = await conn.query(query, {
    perpTable: tableName,
    age: 3,
    fundingRate7dAverageAge: 7,
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
  getPerp,
  insertPerp,
};
