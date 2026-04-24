const axios = require('axios');
const validator = require('validator');

const AppError = require('../../utils/appError');
const { conn } = require('../db');
const exclude = require('../../utils/exclude');

// get pool urls (filtered to only include pools that appear in /pools response)
const getUrl = async (req, res) => {
  const protocolConfig = (
    await axios.get('https://api.llama.fi/config/yields?a=1')
  ).data.protocols;
  const lendingProjects = Object.entries(protocolConfig)
    .filter(([, protocol]) => protocol?.category === 'Lending')
    .map(([project]) => project);

  const query = `
    SELECT
        c.config_id,
        c.url
    FROM
        config c
    CROSS JOIN LATERAL (
        SELECT
            y."tvlUsd"
        FROM
            yield y
        WHERE
            y."configID" = c.config_id
            AND y.timestamp >= NOW() - INTERVAL '$<age> DAY'
        ORDER BY
            y.timestamp DESC
        LIMIT 1
    ) y
    WHERE
        c.pool NOT IN ($<excludePools:csv>)
        AND c.project NOT IN ($<excludeProjects:csv>)
        AND c.symbol NOT LIKE '%RENBTC%'
        AND (
            (c.project IN ($<lendingProjects:csv>) AND y."tvlUsd" >= 0)
            OR y."tvlUsd" >= $<tvlLB>
        )
    `;

  const response = await conn.query(query, {
    excludePools: exclude.excludePools,
    excludeProjects: exclude.excludeAdaptors,
    lendingProjects,
    tvlLB: exclude.boundaries.tvlUsdUI.lb,
    age: exclude.boundaries.age,
  });

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

module.exports = {
  getUrl,
  getDistinctID,
  getConfigPool,
  getAllPools,
};
