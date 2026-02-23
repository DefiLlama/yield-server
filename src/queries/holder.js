const { pgp, connect } = require('../utils/dbConnection');

const holderTable = 'holder';
const stateTable = 'holder_state';

// Insert a daily holder snapshot (with duplicate prevention)
const insertHolder = async (payload) => {
  const conn = await connect();

  const columns = [
    'configID',
    'timestamp',
    { name: 'holderCount', def: null },
    { name: 'avgPositionUsd', def: null },
    { name: 'top10Pct', def: null },
    { name: 'top10Holders', def: null },
    { name: 'medianPositionUsd', def: null },
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: holderTable });
  const query =
    pgp.helpers.insert(payload, cs) +
    ' ON CONFLICT ("configID", timestamp) DO NOTHING';
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

// Get all holder states joined with config + latest TVL (for daily incremental).
// Does NOT fetch balanceMap — caller must lazy-load per pool via getHolderState().
const getAllHolderStates = async (tvlLB = 10000) => {
  const conn = await connect();

  const query = `
    WITH latest_tvl AS (
      SELECT DISTINCT ON ("configID") "configID", "tvlUsd"
      FROM yield
      WHERE timestamp >= NOW() - INTERVAL '7 days'
      ORDER BY "configID", timestamp DESC
    )
    SELECT
      c.config_id AS "configID",
      c.pool,
      hs."lastBlock",
      lt."tvlUsd"
    FROM config c
    JOIN holder_state hs ON hs."configID" = c.config_id
    JOIN latest_tvl lt ON lt."configID" = c.config_id
    WHERE lt."tvlUsd" >= $<tvlLB>
  `;
  return conn.query(query, { tvlLB });
};

// Get latest holder snapshot per pool (for enrichment pipeline)
const getLatestHolders = async () => {
  const conn = await connect();

  const query = `
    SELECT DISTINCT ON ("configID")
      "configID", "holderCount", "avgPositionUsd", "top10Pct", "medianPositionUsd"
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
    SELECT timestamp, "holderCount", "avgPositionUsd", "top10Pct", "medianPositionUsd"
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
    WITH latest_tvl AS (
      SELECT DISTINCT ON ("configID") "configID", "tvlUsd"
      FROM yield
      WHERE timestamp >= NOW() - INTERVAL '7 days'
      ORDER BY "configID", timestamp DESC
    )
    SELECT
      c.config_id AS "configID",
      c.pool,
      lt."tvlUsd"
    FROM config c
    JOIN latest_tvl lt ON lt."configID" = c.config_id
    LEFT JOIN holder_state hs ON hs."configID" = c.config_id
    WHERE lt."tvlUsd" >= $<tvlLB>
      AND hs."configID" IS NULL
  `;
  return conn.query(query, { tvlLB });
};

// Get holderCount from N days ago per pool (for holderChange7d/30d)
const getHolderOffset = async (days) => {
  const conn = await connect();
  const daysMs = days * 60 * 60 * 24 * 1000;
  const tOffset = Date.now() - daysMs;
  const h = 6; // 6h window (holder snapshots are daily, ~06:00 UTC)
  const tWindow = 60 * 60 * h * 1000;
  const tsLB = new Date(tOffset - tWindow);
  const tsUB = new Date(tOffset + tWindow);

  const query = `
    SELECT DISTINCT ON ("configID") "configID", "holderCount"
    FROM holder
    WHERE timestamp >= $<tsLB> AND timestamp <= $<tsUB>
    ORDER BY "configID", timestamp DESC
  `;
  const rows = await conn.query(query, { tsLB, tsUB });
  const result = {};
  for (const row of rows) {
    result[row.configID] = row.holderCount;
  }
  return result;
};

module.exports = {
  insertHolder,
  upsertHolderState,
  getHolderState,
  getAllHolderStates,
  getLatestHolders,
  getHolderHistory,
  getHolderOffset,
  getPoolsWithoutHolderState,
};
