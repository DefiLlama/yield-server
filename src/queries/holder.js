const { pgp, connect } = require('../utils/dbConnection');

const holderTable = 'holder';
const stateTable = 'holder_state';

// Insert a daily holder snapshot
const insertHolder = async (payload) => {
  const conn = await connect();

  const columns = [
    'configID',
    'timestamp',
    { name: 'holderCount', def: null },
    { name: 'avgPositionUsd', def: null },
    { name: 'top10Pct', def: null },
    { name: 'top10Holders', def: null },
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: holderTable });
  const query = pgp.helpers.insert(payload, cs);
  await conn.query(query);
};

// Upsert holder processing state (last block + balance map)
const upsertHolderState = async (configID, lastBlock, balanceMap) => {
  const conn = await connect();

  const query = `
    INSERT INTO $<table:name> ("configID", "lastBlock", "balanceMap", updated_at)
    VALUES ($<configID>, $<lastBlock>, $<balanceMap:json>, NOW())
    ON CONFLICT ("configID") DO UPDATE SET
      "lastBlock" = $<lastBlock>,
      "balanceMap" = $<balanceMap:json>,
      updated_at = NOW()
  `;
  await conn.query(query, {
    table: stateTable,
    configID,
    lastBlock,
    balanceMap,
  });
};

// Get holder state for a single pool
const getHolderState = async (configID) => {
  const conn = await connect();

  const query = `
    SELECT "configID", "lastBlock", "balanceMap"
    FROM $<table:name>
    WHERE "configID" = $<configID>
  `;
  const rows = await conn.query(query, { table: stateTable, configID });
  return rows.length > 0 ? rows[0] : null;
};

// Get all holder states joined with config + latest TVL (for daily incremental)
const getAllHolderStates = async (tvlLB = 10000) => {
  const conn = await connect();

  const query = `
    SELECT
      c.config_id AS "configID",
      c.pool,
      hs."lastBlock",
      hs."balanceMap",
      y."tvlUsd"
    FROM config c
    JOIN holder_state hs ON hs."configID" = c.config_id
    CROSS JOIN LATERAL (
      SELECT "tvlUsd"
      FROM yield
      WHERE "configID" = c.config_id
      ORDER BY timestamp DESC
      LIMIT 1
    ) y
    WHERE y."tvlUsd" >= $<tvlLB>
  `;
  return conn.query(query, { tvlLB });
};

// Get latest holder snapshot per pool (for enrichment pipeline)
const getLatestHolders = async () => {
  const conn = await connect();

  const query = `
    SELECT DISTINCT ON ("configID")
      "configID", "holderCount", "avgPositionUsd", "top10Pct"
    FROM holder
    ORDER BY "configID", timestamp DESC
  `;
  const rows = await conn.query(query);

  // Key by configID for O(1) lookup in enrichment
  const result = {};
  for (const row of rows) {
    result[row.configID] = row;
  }
  return result;
};

// Get holder time series for a specific pool (for chart endpoint)
const getHolderHistory = async (configID) => {
  const conn = await connect();

  const query = `
    SELECT timestamp, "holderCount", "avgPositionUsd", "top10Pct"
    FROM holder
    WHERE "configID" = $<configID>
    ORDER BY timestamp ASC
  `;
  return conn.query(query, { configID });
};

// Get all active pools that don't have holder state yet (for backfill)
const getPoolsWithoutHolderState = async (tvlLB = 10000) => {
  const conn = await connect();

  const query = `
    SELECT
      c.config_id AS "configID",
      c.pool,
      y."tvlUsd"
    FROM config c
    CROSS JOIN LATERAL (
      SELECT "tvlUsd"
      FROM yield
      WHERE "configID" = c.config_id
      ORDER BY timestamp DESC
      LIMIT 1
    ) y
    LEFT JOIN holder_state hs ON hs."configID" = c.config_id
    WHERE y."tvlUsd" >= $<tvlLB>
      AND hs."configID" IS NULL
  `;
  return conn.query(query, { tvlLB });
};

module.exports = {
  insertHolder,
  upsertHolderState,
  getHolderState,
  getAllHolderStates,
  getLatestHolders,
  getHolderHistory,
  getPoolsWithoutHolderState,
};
