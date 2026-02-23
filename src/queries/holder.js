const { pgp, connect } = require('../utils/dbConnection');
const { writeToS3, readFromS3 } = require('../utils/s3');

const holderTable = 'holder_daily';
const stateTable = 'holder_state';
function balanceMapKey(configID) {
  return `holder-balance-maps/${configID}.json`;
}

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
    { name: 'medianPositionUsd', def: null },
  ];
  const cs = new pgp.helpers.ColumnSet(columns, { table: holderTable });
  const query =
    pgp.helpers.insert(payload, cs) +
    ` ON CONFLICT ("configID", timestamp) DO UPDATE SET
      "holderCount" = EXCLUDED."holderCount",
      "avgPositionUsd" = EXCLUDED."avgPositionUsd",
      "top10Pct" = EXCLUDED."top10Pct",
      "top10Holders" = EXCLUDED."top10Holders",
      "medianPositionUsd" = EXCLUDED."medianPositionUsd"`;
  await conn.query(query);
};

// Upsert holder processing state (last block + balance map).
// balanceMap is written to S3 first; Postgres only stores lastBlock.
// Write order: S3 first so that if S3 fails, lastBlock doesn't advance
// and the retry rescans the same block range.
const upsertHolderState = async (configID, lastBlock, balanceMap) => {
  await writeToS3(process.env.BUCKET_DATA, balanceMapKey(configID), balanceMap);

  const conn = await connect();
  const query = `
    INSERT INTO $<table:name> ("configID", "lastBlock", updated_at)
    VALUES ($<configID>, $<lastBlock>, NOW())
    ON CONFLICT ("configID") DO UPDATE SET
      "lastBlock" = $<lastBlock>,
      updated_at = NOW()
  `;
  await conn.query(query, { table: stateTable, configID, lastBlock });
};

// Get holder state for a single pool.
// Fetches lastBlock from Postgres, then loads balanceMap from S3.
// NoSuchKey → empty map (new pool); other S3 errors re-throw for retry.
const getHolderState = async (configID) => {
  const conn = await connect();

  const query = `
    SELECT "configID", "lastBlock"
    FROM $<table:name>
    WHERE "configID" = $<configID>
  `;
  const rows = await conn.query(query, { table: stateTable, configID });
  if (rows.length === 0) return null;

  let balanceMap = {};
  try {
    balanceMap = await readFromS3(process.env.BUCKET_DATA, balanceMapKey(configID));
  } catch (err) {
    if (err.code === 'NoSuchKey') {
      console.log(`No S3 balance map for ${configID} — treating as empty`);
    } else {
      throw new Error(`S3 read failed for ${configID}: ${err.message}`, { cause: err });
    }
  }

  return { ...rows[0], balanceMap };
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
    FROM holder_daily
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
    FROM holder_daily
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

// Get holderCount from N days ago per pool (for holderChange7d/30d).
// Timestamps are at midnight UTC, so we target the exact day.
// Falls back to the closest row within ±1 day if the exact day is missing.
const getHolderOffset = async (days) => {
  const conn = await connect();
  const target = new Date();
  target.setUTCHours(0, 0, 0, 0);
  target.setUTCDate(target.getUTCDate() - days);

  const query = `
    SELECT DISTINCT ON ("configID") "configID", "holderCount"
    FROM holder_daily
    WHERE timestamp BETWEEN $<target> - INTERVAL '1 day'
                        AND $<target> + INTERVAL '1 day'
    ORDER BY "configID", ABS(EXTRACT(EPOCH FROM (timestamp - $<target>)))
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
  upsertHolderState,
  getHolderState,
  getAllHolderStates,
  getLatestHolders,
  getHolderHistory,
  getHolderOffset,
  getPoolsWithoutHolderState,
};
