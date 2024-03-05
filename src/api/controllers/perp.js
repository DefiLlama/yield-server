const validator = require('validator');

const AppError = require('../../utils/appError');
const { conn } = require('../db');

// get latest data for each unique perp
const getPerp = async (req, res) => {
  const query = `
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
                perpetual
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
                                perpetual
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
                                perpetual
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
    `;

  const response = await conn.query(query, {
    age: 3, // last 3 hours
    ageWeeklyStats: 7,
    ageMonthlyStats: 30,
  });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.status(200).json({
    status: 'success',
    data: response,
  });
};

module.exports = { getPerp };
