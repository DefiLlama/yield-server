const validator = require('validator');

const AppError = require('../../utils/appError');
const { conn } = require('../db');
const exclude = require('../../utils/exclude');

// get pool urls (filtered to only include pools that appear in /pools response)
const getUrl = async (req, res) => {
  const query = `
    SELECT
        c.config_id,
        c.url
    FROM
        config c
    WHERE
        c.pool NOT IN ($<excludePools:csv>)
        AND c.project NOT IN ($<excludeProjects:csv>)
        AND c.symbol NOT LIKE '%RENBTC%'
        AND EXISTS (
            SELECT 1
            FROM yield y
            WHERE y."configID" = c.config_id
              AND y."tvlUsd" >= $<tvlLB>
              AND y.timestamp >= NOW() - INTERVAL '$<age> DAY'
        )
    `;

  const response = await conn.query(query, {
    excludePools: exclude.excludePools,
    excludeProjects: exclude.excludeAdaptors,
    tvlLB: exclude.boundaries.tvlUsdUI.lb,
    age: exclude.boundaries.age,
  });

  console.log(response.length)

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  const out = {};
  for (const e of response) {
    out[e.config_id] = e.url;
  }
  res.status(200).json(out);
};

// get unique pool values
// (used during adapter testing to check if a pool field is already in the DB)
const getDistinctID = async (req, res) => {
  const query = `
    SELECT
        DISTINCT(pool),
        config_id,
        project
    FROM
        config
    `;
  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.status(200).json(response);
};

// get config data of pool
const getConfigPool = async (req, res) => {
  const configID = req.params.configID;
  const ids = configID.split(',');
  const valid =
    ids.map((id) => validator.isUUID(id)).reduce((a, b) => a + b, 0) ===
    ids.length;
  if (!valid) return { status: 'invalid uuid parameter' };

  const query = `
    SELECT
      *
    FROM
        config
    WHERE
        config_id IN ($<configIDs:csv>)
    `;
  const response = await conn.query(query, { configIDs: ids });

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.status(200).json({
    status: 'success',
    data: response,
  });
};

// for calc liq on main protocol dashboard
const getAllPools = async (req, res) => {
  const query = `
    SELECT
        config_id,
        symbol,
        project,
        chain,
        "underlyingTokens"
    FROM
        config
    `;

  const response = await conn.query(query);

  if (!response) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.status(200).json(response);
};

// pro endpoint: token address for a pool
const getTokenAddress = async (req, res) => {
  const configID = req.query.configID;
  if (!configID || !validator.isUUID(configID))
    return res.status(400).json('invalid configID!');

  const query = `
    SELECT
        c.config_id,
        c.token
    FROM
        config c
    WHERE
        c.config_id = $<configID>
    `;

  const response = await conn.query(query, { configID });

  if (!response || response.length === 0) {
    return new AppError(`Couldn't get data`, 404);
  }

  res.status(200).json({
    status: 'success',
    data: { configID: response[0].config_id, token: response[0].token },
  });
};

module.exports = {
  getUrl,
  getDistinctID,
  getConfigPool,
  getAllPools,
  getTokenAddress,
};
