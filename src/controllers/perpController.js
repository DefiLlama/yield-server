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
        "fundingRate7dAverage",
        "fundingRate7dSum",
        "fundingRate30dAverage",
        "fundingRate30dSum"
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
                weeklyStats.marketplace,
                weeklyStats.market,
                "fundingRate7dAverage",
                "fundingRate7dSum",
                "fundingRate30dAverage",
                "fundingRate30dSum"
            FROM
                (
                    SELECT
                        marketplace,
                        market,
                        round(avg("fundingRatePrevious"), 10) AS "fundingRate7dAverage",
                        round(sum("fundingRatePrevious"), 10) AS "fundingRate7dSum"
                    FROM
                        (
                            SELECT
                                DISTINCT ON (marketplace, market, "fundingTimePrevious") *
                            FROM
                                $<perpTable:name>
                            WHERE
                                "fundingTimePrevious" IS NOT NULL
                                AND timestamp >= NOW() - INTERVAL '$<ageWeeklyStats> DAY'
                            ORDER BY
                                marketplace,
                                market,
                                "fundingTimePrevious" DESC
                        ) AS main
                    GROUP BY
                        marketplace,
                        market
                ) AS weeklyStats
                JOIN (
                    SELECT
                        marketplace,
                        market,
                        round(avg("fundingRatePrevious"), 10) AS "fundingRate30dAverage",
                        round(sum("fundingRatePrevious"), 10) AS "fundingRate30dSum"
                    FROM
                        (
                            SELECT
                                DISTINCT ON (marketplace, market, "fundingTimePrevious") *
                            FROM
                                $<perpTable:name>
                            WHERE
                                "fundingTimePrevious" IS NOT NULL
                                AND timestamp >= NOW() - INTERVAL '$<ageMonthlyStats> DAY'
                            ORDER BY
                                marketplace,
                                market,
                                "fundingTimePrevious" DESC
                        ) AS main
                    GROUP BY
                        marketplace,
                        market
                ) AS monthlyStats ON weeklyStats.marketplace = monthlyStats.marketplace
                AND weeklyStats.market = monthlyStats.market
        ) AS stats ON stats.marketplace = main.marketplace
        AND stats.market = main.market
    `,
    { compress: true }
  );

  const response = await conn.query(query, {
    perpTable: tableName,
    age: 3, // last 3 hours
    ageWeeklyStats: 7,
    ageMonthlyStats: 30,
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
