const { pgp, connect } = require('../utils/dbConnection');

const holderTable = 'holder_daily';

const holderColumns = new pgp.helpers.ColumnSet(
  [
    'configID',
    'timestamp',
    { name: 'holderCount', def: null },
    { name: 'avgPositionUsd', def: null },
    { name: 'top10Pct', def: null },
    { name: 'top10Holders', def: null, mod: ':json' },
  ],
  { table: holderTable }
);

// Upsert daily holder snapshots. Accepts a single object or an array.
// Callers must pass a midnight-UTC timestamp so the unique index
// naturally deduplicates same-day re-runs.
const insertHolder = async (payloads) => {
  const conn = await connect();

  const rows = Array.isArray(payloads) ? payloads : [payloads];
  if (rows.length === 0) return;

  const query =
    pgp.helpers.insert(rows, holderColumns) +
    ' ON CONFLICT ("configID", timestamp) DO UPDATE SET ' +
    holderColumns.assignColumns({ from: 'EXCLUDED', skip: ['configID', 'timestamp'] });
  await conn.query(query);
};

// Get all eligible pools with TVL above threshold (for daily processing).
// Returns token (receipt-token from PR #2447 migration) for accurate holder lookups.
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
      c.chain,
      c.token,
      lt."tvlUsd"
    FROM config c
    JOIN latest_tvl lt ON lt."configID" = c.config_id
    WHERE lt."tvlUsd" >= $<tvlLB>
  `;
  return conn.query(query, { tvlLB });
};

// Get latest holder snapshot per pool (for enrichment pipeline).
// Bounds scan to last 30 days — data is inserted daily so this is safe.
const getLatestHolders = async (conn) => {
  conn = conn || (await connect());

  const query = `
    SELECT DISTINCT ON ("configID")
      "configID", "holderCount", "avgPositionUsd", "top10Pct", "top10Holders"
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
const getHolderHistory = async (configID, conn) => {
  conn = conn || (await connect());

  const query = `
    SELECT timestamp, "holderCount", "avgPositionUsd", "top10Pct", "top10Holders"
    FROM holder_daily
    WHERE "configID" = $<configID>
    ORDER BY timestamp ASC
  `;
  return conn.query(query, { configID });
};

// Get holderCount from N days ago per pool (for holderChange7d/30d).
// Uses a 2-day window and picks the closest snapshot to handle missed days.
const getHolderOffset = async (days, conn) => {
  conn = conn || (await connect());
  const target = new Date();
  target.setUTCHours(0, 0, 0, 0);
  target.setUTCDate(target.getUTCDate() - days);

  const query = `
    SELECT DISTINCT ON ("configID") "configID", "holderCount"
    FROM holder_daily
    WHERE timestamp >= $<target>::timestamp - INTERVAL '2 days'
      AND timestamp <= $<target>::timestamp
    ORDER BY "configID", timestamp DESC
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
