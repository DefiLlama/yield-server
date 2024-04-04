const validator = require('validator');

const AppError = require('../../utils/appError');
const { conn } = require('../db');

const getYieldHistory = async (req, res) => {
  const configID = req.params.pool;
  if (!validator.isUUID(configID))
    return res.status(400).json('invalid configID!');

  const query = `
          SELECT
              timestamp,
              "tvlUsd",
              apy,
              "apyBase",
              "apyReward",
              "il7d",
              "apyBase7d"
          FROM
              yield
          WHERE
              timestamp IN (
                  SELECT
                      max(timestamp)
                  FROM
                      yield
                  WHERE
                      "configID" = $<configIDValue>
                  GROUP BY
                      (timestamp :: date)
              )
              AND "configID" = $<configIDValue>
          ORDER BY
              timestamp ASC
        `;

  const response = await conn.query(query, { configIDValue: configID });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.status(200).json({
    status: 'success',
    data: response,
  });
};

const getYieldHistoryHourly = async (req, res) => {
  const configID = req.params.pool;
  if (!validator.isUUID(configID))
    return res.status(400).json('invalid configID!');

  const query = `
          SELECT
              timestamp,
              "tvlUsd",
              apy,
              "apyBase",
              "apyReward",
              "il7d",
              "apyBase7d"
          FROM
              yield
          WHERE
              "configID" = $<configIDValue>
          ORDER BY
              timestamp ASC
        `;
  const response = await conn.query(query, { configIDValue: configID });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.status(200).json({
    status: 'success',
    data: response,
  });
};

const getYieldLendBorrowHistory = async (req, res) => {
  const configID = req.params.pool;
  if (!validator.isUUID(configID))
    return res.status(400).json('invalid configID!');

  const query = `
      SELECT
          timestamp,
          "totalSupplyUsd",
          "totalBorrowUsd",
          "debtCeilingUsd",
          "apyBase",
          "apyReward",
          "apyBaseBorrow",
          "apyRewardBorrow"
      FROM
          yield
      WHERE
          timestamp IN (
              SELECT
                  max(timestamp)
              FROM
                  yield
              WHERE
                  "configID" = $<configIDValue>
              GROUP BY
                  (timestamp :: date)
          )
          AND "configID" = $<configIDValue>
      ORDER BY
          timestamp ASC
    `;
  const response = await conn.query(query, { configIDValue: configID });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.status(200).json({
    status: 'success',
    data: response,
  });
};

module.exports = {
  getYieldHistory,
  getYieldHistoryHourly,
  getYieldLendBorrowHistory,
};
