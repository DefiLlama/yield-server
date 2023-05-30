const minify = require('pg-minify');
const validator = require('validator');

const AppError = require('../../utils/appError');
const exclude = require('../../utils/exclude');
const { conn } = require('../../utils/dbConnection');
const customHeader = require('../../utils/customHeader');
const { yieldLendBorrowQuery } = require('../../handlers/queries');

// get full history of given configID
const getYieldHistory = async (req, res) => {
  const configID = req.params.configID;
  if (!validator.isUUID(configID))
    return res.status(400).json('invalid configID!');

  const query = minify(
    `
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
  `,
    { compress: true }
  );

  const response = await conn.query(query, {
    configIDValue: configID,
  });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.set(customHeader()).status(200).json({
    status: 'success',
    data: response,
  });
};

// get last DB entry per unique pool (lending/borrow fields only)
const getYieldLendBorrow = async (req, res) => {
  const response = await conn.query(yieldLendBorrowQuery, {
    tvlLB: exclude.boundaries.tvlUsdUI.lb,
    age: exclude.boundaries.age,
    excludePools: exclude.excludePools,
    excludeProjects: exclude.excludeAdaptors,
  });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.set(customHeader()).status(200).json({
    status: 'success',
    data: response,
  });
};

// get full history of given configID
const getYieldLendBorrowHistory = async (req, res) => {
  const configID = req.params.configID;
  if (!validator.isUUID(configID))
    return res.status(400).json('invalid configID!');

  const query = minify(
    `
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
  `,
    { compress: true }
  );

  const response = await conn.query(query, {
    configIDValue: configID,
  });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.set(customHeader()).status(200).json({
    status: 'success',
    data: response,
  });
};

module.exports = {
  getYieldHistory,
  getYieldLendBorrow,
  getYieldLendBorrowHistory,
};
