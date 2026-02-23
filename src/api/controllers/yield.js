const validator = require('validator');

const AppError = require('../../utils/appError');
const { conn } = require('../db');
const {
  getHolderHistory: getHolderHistoryQuery,
  getLatestHolders,
  getHolderOffset,
} = require('../../queries/holder');

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

const getVolumeHistory = async (req, res) => {
  const configID = req.params.pool;
  if (!validator.isUUID(configID))
    return res.status(400).json('invalid configID!');

  const query = `
          SELECT
              timestamp,
              "volumeUsd1d"
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
              AND "volumeUsd1d" IS NOT NULL
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

const getHolderHistory = async (req, res) => {
  const configID = req.params.pool;
  if (!validator.isUUID(configID))
    return res.status(400).json('invalid configID!');

  try {
    const response = await getHolderHistoryQuery(configID);
    res.status(200).json({ status: 'success', data: response });
  } catch (err) {
    console.log('getHolderHistory failed:', err.message);
    res.status(500).json({ status: 'error' });
  }
};

const getHolders = async (req, res) => {
  try {
    const [holderData, holderOffset7d, holderOffset30d] = await Promise.all([
      getLatestHolders(),
      getHolderOffset(7),
      getHolderOffset(30),
    ]);

    const data = {};
    for (const [configID, h] of Object.entries(holderData)) {
      const prev7d = holderOffset7d[configID];
      const prev30d = holderOffset30d[configID];
      data[configID] = {
        holderCount: h.holderCount,
        avgPositionUsd: Number.isFinite(h.avgPositionUsd)
          ? +h.avgPositionUsd.toFixed(0)
          : null,
        medianPositionUsd: Number.isFinite(h.medianPositionUsd)
          ? +h.medianPositionUsd.toFixed(0)
          : null,
        top10Pct: Number.isFinite(h.top10Pct)
          ? +h.top10Pct.toFixed(2)
          : null,
        holderChange7d:
          h.holderCount != null && prev7d != null
            ? h.holderCount - prev7d
            : null,
        holderChange30d:
          h.holderCount != null && prev30d != null
            ? h.holderCount - prev30d
            : null,
      };
    }

    res.status(200).json({ status: 'success', data });
  } catch (err) {
    console.log('getHolders failed:', err.message);
    res.status(500).json({ status: 'error' });
  }
};

module.exports = {
  getYieldHistory,
  getYieldHistoryHourly,
  getYieldLendBorrowHistory,
  getVolumeHistory,
  getHolderHistory,
  getHolders,
};
