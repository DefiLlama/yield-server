const { pgp, connect } = require('../utils/dbConnection');

const holderTable = 'holder_daily';

// Upsert a daily holder snapshot (one row per configID/day).
// Callers must pass a midnight-UTC timestamp so the unique index
// naturally deduplicates same-day re-runs.
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
  const query =
    pgp.helpers.insert(payload, cs) +
    ` ON CONFLICT ("configID", timestamp) DO UPDATE SET
      "holderCount" = EXCLUDED."holderCount",
      "avgPositionUsd" = EXCLUDED."avgPositionUsd",
      "top10Pct" = EXCLUDED."top10Pct",
      "top10Holders" = EXCLUDED."top10Holders"`;
  await conn.query(query);
};

// Get all eligible pools with TVL above threshold (for daily processing).
const getEligiblePools = async (tvlLB = 10000) => {
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
    WHERE lt."tvlUsd" >= $<tvlLB>
  `;
  return conn.query(query, { tvlLB });
};

// Get latest holder snapshot per pool (for enrichment pipeline).
// Bounds scan to last 30 days — data is inserted daily so this is safe.
const getLatestHolders = async () => {
  const conn = await connect();

  const query = `
    SELECT DISTINCT ON ("configID")
      "configID", "holderCount", "avgPositionUsd", "top10Pct"
    FROM holder_daily
    WHERE timestamp >= NOW() - INTERVAL '30 days'
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
    FROM holder_daily
    WHERE "configID" = $<configID>
    ORDER BY timestamp ASC
  `;
  return conn.query(query, { configID });
};

// Get holderCount from N days ago per pool (for holderChange7d/30d).
// Timestamps are always midnight UTC, so an exact match is sufficient.
const getHolderOffset = async (days) => {
  const conn = await connect();
  const target = new Date();
  target.setUTCHours(0, 0, 0, 0);
  target.setUTCDate(target.getUTCDate() - days);

  const query = `
    SELECT "configID", "holderCount"
    FROM holder_daily
    WHERE timestamp = $<target>
  `;
  const rows = await conn.query(query, { target });
  const result = {};
  for (const row of rows) {
    result[row.configID] = row.holderCount;
  }
  return result;
};

module.exports = {
  insertHolder,
  getEligiblePools,
  getLatestHolders,
  getHolderHistory,
  getHolderOffset,
};
